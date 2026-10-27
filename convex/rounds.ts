import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { targetEndFor } from "./lib/schedule";

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
