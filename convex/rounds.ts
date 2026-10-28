import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { onRoundCompleted } from "./hooks";
import { JUZ_COUNT } from "./lib/juz";
import { targetEndFor } from "./lib/schedule";
import { getSetting } from "./lib/settings";

/**
 * Inserts round `number` of a khatma, starting at `startedAt` with the target
 * end its schedule implies, and makes it the khatma's current round.
 */
export async function insertRound(
  ctx: MutationCtx,
  khatmaId: Id<"khatmas">,
  number: number,
  startedAt: number,
): Promise<Id<"rounds">> {
  const khatma = await ctx.db.get(khatmaId);
  if (!khatma) throw new Error("insertRound: khatma not found");
  const roundId = await ctx.db.insert("rounds", {
    khatmaId,
    number,
    startedAt,
    targetEndAt: targetEndFor(khatma.schedule, startedAt),
    completedAt: null,
    lastFinishedAt: null,
  });
  await ctx.db.patch(khatmaId, { currentRoundId: roundId });
  return roundId;
}

/** Every assignment row of a round, including released ones. */
export async function roundAssignments(
  ctx: QueryCtx,
  roundId: Id<"rounds">,
): Promise<Doc<"assignments">[]> {
  return await ctx.db
    .query("assignments")
    .withIndex("by_round", (q) => q.eq("roundId", roundId))
    .collect();
}

/** The assignment a person currently holds (neither finished nor released), if any. */
export function heldAssignment(
  assignments: readonly Doc<"assignments">[],
  personId: Id<"people">,
): Doc<"assignments"> | null {
  return (
    assignments.find(
      (a) =>
        a.personId === personId &&
        a.finishedAt === null &&
        a.releasedAt === null,
    ) ?? null
  );
}

/** Per-juz state from a round's assignment rows: done beats reading beats open. */
export function juzStates(
  assignments: readonly Doc<"assignments">[],
): Map<number, { state: "reading" | "done"; assignment: Doc<"assignments"> }> {
  const byJuz = new Map<
    number,
    { state: "reading" | "done"; assignment: Doc<"assignments"> }
  >();
  for (const a of assignments) {
    if (byJuz.get(a.juz)?.state === "done") continue;
    if (a.finishedAt !== null)
      byJuz.set(a.juz, { state: "done", assignment: a });
    else if (a.releasedAt === null)
      byJuz.set(a.juz, { state: "reading", assignment: a });
  }
  return byJuz;
}

/** How many of the 30 ajza' are done in a round's assignment rows. */
export function doneCount(assignments: readonly Doc<"assignments">[]): number {
  let done = 0;
  for (const { state } of juzStates(assignments).values()) {
    if (state === "done") done++;
  }
  return done;
}

/**
 * Completes a round once all 30 ajza' are done and `completionDelayMs` has
 * passed since the round's most recent finish, then starts the next round.
 * Safe to schedule any number of times: it is a no-op unless the round is the
 * khatma's current, still-open round, and it re-arms itself when a later
 * finish moved the deadline.
 */
export const completeIfReady = internalMutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args): Promise<{ completed: boolean }> => {
    const round = await ctx.db.get(args.roundId);
    if (!round || round.completedAt !== null) return { completed: false };
    const khatma = await ctx.db.get(round.khatmaId);
    if (!khatma || khatma.currentRoundId !== round._id) {
      return { completed: false };
    }

    const assignments = await roundAssignments(ctx, round._id);
    if (doneCount(assignments) < JUZ_COUNT) return { completed: false };

    const lastFinishedAt =
      round.lastFinishedAt ??
      Math.max(...assignments.map((a) => a.finishedAt ?? 0));
    const readyAt =
      lastFinishedAt + (await getSetting(ctx, "completionDelayMs"));
    const now = Date.now();
    if (now < readyAt) {
      // A later finish moved the deadline: come back then instead of dropping.
      await ctx.scheduler.runAt(readyAt, internal.rounds.completeIfReady, {
        roundId: round._id,
      });
      return { completed: false };
    }

    await ctx.db.patch(round._id, { completedAt: now });
    await ctx.db.patch(khatma._id, {
      completedRounds: khatma.completedRounds + 1,
    });
    await insertRound(ctx, khatma._id, round.number + 1, now);
    await onRoundCompleted(ctx, khatma._id, round.number);
    return { completed: true };
  },
});
