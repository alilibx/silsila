import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { JUZ_COUNT } from "./lib/juz";
import { khatmaByInviteCode } from "./lib/khatma";
import { checkRateLimit } from "./lib/rateLimit";
import { getSetting } from "./lib/settings";
import {
  requirePerson,
  sessionMutation,
  type SessionContext,
} from "./lib/session";
import {
  doneCount,
  heldAssignment,
  juzStates,
  roundAssignments,
} from "./rounds";

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
      // Only a take that really creates a membership spends a join slot.
      const joinOk = await checkRateLimit(
        ctx,
        `join:${khatma._id}`,
        await getSetting(ctx, "newMembersPerKhatmaPerHour"),
        HOUR_MS,
      );
      if (!joinOk) return soft("rate_limited");
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

// ---------------------------------------------------------------------------
// Finish, undo, release

export type FinishResult =
  | { ok: true; undoUntil: number }
  | {
      ok: false;
      reason: "not_holding" | "blocked" | "rate_limited" | "maintenance";
    };

export type UndoResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "window_closed"
        | "holding_another"
        | "round_completed"
        | "nothing_to_undo"
        | "blocked"
        | "rate_limited"
        | "maintenance";
    };

export type ReleaseResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_holding" | "blocked" | "rate_limited" | "maintenance";
    };

/**
 * What finish, undo, and release share: the signed-in person, the khatma
 * behind the invite code and its current round, after the maintenance and
 * blocked checks and the per-person pool rate limit (the same bucket as `take`).
 */
async function poolActor(
  ctx: MutationCtx & SessionContext,
  inviteCode: string,
): Promise<
  | {
      ok: true;
      person: Doc<"people">;
      khatma: Doc<"khatmas">;
      round: Doc<"rounds">;
    }
  | { ok: false; reason: "blocked" | "rate_limited" | "maintenance" }
> {
  const person = requirePerson(ctx);
  // before the rate limit, so a refused call does not spend the bucket
  if (await getSetting(ctx, "maintenanceMode")) {
    return { ok: false, reason: "maintenance" };
  }
  const khatma = await khatmaByInviteCode(ctx, inviteCode);
  if (!khatma?.currentRoundId) throw new ConvexError({ code: "not_found" });
  const round = await ctx.db.get(khatma.currentRoundId);
  if (!round) throw new ConvexError({ code: "not_found" });

  const member = await ctx.db
    .query("members")
    .withIndex("by_khatma_person", (q) =>
      q.eq("khatmaId", khatma._id).eq("personId", person._id),
    )
    .first();
  if (member?.status === "blocked") return { ok: false, reason: "blocked" };

  const allowed = await checkRateLimit(
    ctx,
    `pool:${person._id}`,
    await getSetting(ctx, "poolActionsPerPersonPerMinute"),
    MINUTE_MS,
  );
  if (!allowed) return { ok: false, reason: "rate_limited" };
  return { ok: true, person, khatma, round };
}

export const finish = sessionMutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<FinishResult> => {
    const actor = await poolActor(ctx, args.inviteCode);
    if (!actor.ok) return actor;
    const { person, round } = actor;

    const assignments = await roundAssignments(ctx, round._id);
    const held = heldAssignment(assignments, person._id);
    if (!held) return { ok: false, reason: "not_holding" };

    const now = Date.now();
    await ctx.db.patch(held._id, { finishedAt: now });
    await ctx.db.patch(round._id, { lastFinishedAt: now });
    if (doneCount(assignments) + 1 >= JUZ_COUNT) {
      await ctx.scheduler.runAt(
        now + (await getSetting(ctx, "completionDelayMs")),
        internal.rounds.completeIfReady,
        { roundId: round._id },
      );
    }
    return {
      ok: true,
      undoUntil: now + (await getSetting(ctx, "undoWindowMs")),
    };
  },
});

export const undoFinish = sessionMutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<UndoResult> => {
    const actor = await poolActor(ctx, args.inviteCode);
    if (!actor.ok) return actor;
    const { person, khatma, round } = actor;

    const assignments = await roundAssignments(ctx, round._id);
    const lastDone = assignments
      .filter((a) => a.personId === person._id && a.finishedAt !== null)
      .sort(
        (a, b) =>
          (b.finishedAt ?? 0) - (a.finishedAt ?? 0) ||
          b._creationTime - a._creationTime,
      )[0];
    const undoWindowMs = await getSetting(ctx, "undoWindowMs");
    const now = Date.now();
    if (!lastDone) {
      // Their latest finish, if any, is in an earlier round. Newest round first.
      let latestRound: number | null = null;
      let latestFinishedAt = 0;
      const earlier = ctx.db
        .query("assignments")
        .withIndex("by_khatma_person", (q) =>
          q.eq("khatmaId", khatma._id).eq("personId", person._id),
        )
        .order("desc")
        .filter((q) => q.neq(q.field("finishedAt"), null));
      for await (const a of earlier) {
        latestRound ??= a.roundNumber;
        if (a.roundNumber !== latestRound) break;
        latestFinishedAt = Math.max(latestFinishedAt, a.finishedAt ?? 0);
      }
      if (latestRound === null) return { ok: false, reason: "nothing_to_undo" };
      // Only a finish that just lost its round to completion is "completed";
      // anything older has simply outlived the undo window.
      return {
        ok: false,
        reason:
          latestRound === round.number - 1 &&
          now - latestFinishedAt <= undoWindowMs
            ? "round_completed"
            : "window_closed",
      };
    }
    // Defensive: the current round is never completed (completion starts the next).
    if (round.completedAt !== null) {
      return { ok: false, reason: "round_completed" };
    }
    if (now - (lastDone.finishedAt ?? 0) > undoWindowMs) {
      return { ok: false, reason: "window_closed" };
    }
    if (heldAssignment(assignments, person._id)) {
      return { ok: false, reason: "holding_another" };
    }

    await ctx.db.patch(lastDone._id, { finishedAt: null });
    // The deadline for completion follows the latest finish that still stands.
    const remaining = assignments
      .filter((a) => a._id !== lastDone._id && a.finishedAt !== null)
      .map((a) => a.finishedAt as number);
    await ctx.db.patch(round._id, {
      lastFinishedAt: remaining.length > 0 ? Math.max(...remaining) : null,
    });
    return { ok: true };
  },
});

export const release = sessionMutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<ReleaseResult> => {
    const actor = await poolActor(ctx, args.inviteCode);
    if (!actor.ok) return actor;
    const { person, round } = actor;

    const held = heldAssignment(
      await roundAssignments(ctx, round._id),
      person._id,
    );
    if (!held) return { ok: false, reason: "not_holding" };
    await ctx.db.patch(held._id, {
      releasedAt: Date.now(),
      releasedBySystem: false,
    });
    return { ok: true };
  },
});
