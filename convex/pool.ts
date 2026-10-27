import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { khatmaByInviteCode } from "./lib/khatma";
import { checkRateLimit } from "./lib/rateLimit";
import { getSetting } from "./lib/settings";
import { requirePerson, sessionMutation } from "./lib/session";
import { juzStates, roundAssignments } from "./rounds";

const JUZ_COUNT = 30;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export type TakeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "taken"
        | "already_holding"
        | "khatma_full"
        | "blocked"
        | "maintenance"
        | "rate_limited";
    };

/**
 * The juz' to suggest to `personId` (or to a signed-out viewer when `null`):
 * the lowest-numbered open juz' they did not finish in their own last
 * `rotationLookbackRounds` rounds of this khatma, i.e. the most recent earlier
 * rounds in which they finished at least one juz' (spec 3.5). Falls back to the
 * lowest open juz'; `null` when none is open.
 */
export async function suggestJuz(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  personId: Id<"people"> | null,
): Promise<number | null> {
  const khatma = await ctx.db.get(khatmaId);
  if (!khatma?.currentRoundId) return null;
  const round = await ctx.db.get(khatma.currentRoundId);
  if (!round) return null;

  const taken = juzStates(await roundAssignments(ctx, round._id));
  const open: number[] = [];
  for (let juz = 1; juz <= JUZ_COUNT; juz++) {
    if (!taken.has(juz)) open.push(juz);
  }
  const lowestOpen = open[0] ?? null;
  if (lowestOpen === null || personId === null) return lowestOpen;

  const lookback = await getSetting(ctx, "rotationLookbackRounds");
  const recentlyRead = await juzFinishedInRecentRounds(
    ctx,
    khatmaId,
    personId,
    round.number,
    lookback,
  );
  return open.find((juz) => !recentlyRead.has(juz)) ?? lowestOpen;
}

/**
 * The ajza' `personId` finished in their last `lookback` rounds (before round
 * `beforeRound`) in which they finished anything. Reads newest-first and stops
 * as soon as an older round than the window shows up, so the cost is bounded
 * by the window, not by the khatma's age.
 */
async function juzFinishedInRecentRounds(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  personId: Id<"people">,
  beforeRound: number,
  lookback: number,
): Promise<Set<number>> {
  const juzByRound = new Map<number, Set<number>>();
  if (lookback <= 0) return new Set();
  const finished = ctx.db
    .query("assignments")
    .withIndex("by_khatma_person", (q) =>
      q.eq("khatmaId", khatmaId).eq("personId", personId),
    )
    .order("desc")
    .filter((q) => q.neq(q.field("finishedAt"), null));
  for await (const a of finished) {
    if (a.roundNumber >= beforeRound) continue;
    let juzSet = juzByRound.get(a.roundNumber);
    if (!juzSet) {
      if (juzByRound.size >= lookback) break;
      juzSet = new Set();
      juzByRound.set(a.roundNumber, juzSet);
    }
    juzSet.add(a.juz);
  }
  return new Set([...juzByRound.values()].flatMap((s) => [...s]));
}

/** Whether a juz' of the round is held or finished (a released row doesn't count). */
function isTaken(rows: readonly Doc<"assignments">[]): boolean {
  return rows.some((a) => a.finishedAt !== null || a.releasedAt === null);
}

const soft = (
  reason: Extract<TakeResult, { ok: false }>["reason"],
): TakeResult => ({ ok: false, reason });

export const take = sessionMutation({
  args: { inviteCode: v.string(), juz: v.number() },
  handler: async (ctx, args): Promise<TakeResult> => {
    const person = requirePerson(ctx);
    if (!Number.isInteger(args.juz) || args.juz < 1 || args.juz > JUZ_COUNT) {
      throw new ConvexError({ code: "invalid_juz" });
    }
    if (await getSetting(ctx, "maintenanceMode")) return soft("maintenance");

    const khatma = await khatmaByInviteCode(ctx, args.inviteCode);
    if (!khatma?.currentRoundId) throw new ConvexError({ code: "not_found" });
    const round = await ctx.db.get(khatma.currentRoundId);
    if (!round) throw new ConvexError({ code: "not_found" });

    const member = await ctx.db
      .query("members")
      .withIndex("by_khatma_person", (q) =>
        q.eq("khatmaId", khatma._id).eq("personId", person._id),
      )
      .first();
    if (member?.status === "blocked") return soft("blocked");

    const poolOk = await checkRateLimit(
      ctx,
      `pool:${person._id}`,
      await getSetting(ctx, "poolActionsPerPersonPerMinute"),
      MINUTE_MS,
    );
    if (!poolOk) return soft("rate_limited");
    if (!member) {
      const joinOk = await checkRateLimit(
        ctx,
        `join:${khatma._id}`,
        await getSetting(ctx, "newMembersPerKhatmaPerHour"),
        HOUR_MS,
      );
      if (!joinOk) return soft("rate_limited");
    }

    const mine = await ctx.db
      .query("assignments")
      .withIndex("by_round", (q) => q.eq("roundId", round._id))
      .filter((q) => q.eq(q.field("personId"), person._id))
      .collect();
    if (mine.some((a) => a.finishedAt === null && a.releasedAt === null)) {
      return soft("already_holding");
    }

    const sameJuz = await ctx.db
      .query("assignments")
      .withIndex("by_round_juz", (q) =>
        q.eq("roundId", round._id).eq("juz", args.juz),
      )
      .collect();
    if (isTaken(sameJuz)) return soft("taken");

    let memberId = member?._id;
    if (!memberId) {
      const members = await ctx.db
        .query("members")
        .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
        .collect();
      const activeCount = members.filter((m) => m.status === "active").length;
      if (activeCount >= (await getSetting(ctx, "maxMembers"))) {
        return soft("khatma_full");
      }
      memberId = await ctx.db.insert("members", {
        khatmaId: khatma._id,
        personId: person._id,
        joinedAt: Date.now(),
        status: "active",
        nudgesOn: true,
        // a newcomer never sees a celebration for rounds they didn't join
        lastCelebratedRound: khatma.completedRounds,
      });
    }

    await ctx.db.insert("assignments", {
      khatmaId: khatma._id,
      roundId: round._id,
      roundNumber: round.number,
      juz: args.juz,
      memberId,
      personId: person._id,
      takenAt: Date.now(),
      finishedAt: null,
      releasedAt: null,
      releasedBySystem: false,
    });
    return { ok: true };
  },
});
