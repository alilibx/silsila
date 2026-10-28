import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/**
 * Called inside the completing mutation right after a round is completed and
 * the next one has started. Empty in v1's core loop; plan 2 adds push
 * notifications here.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- signature fixed for plan 2 */
export async function onRoundCompleted(
  ctx: MutationCtx,
  khatmaId: Id<"khatmas">,
  roundNumber: number,
): Promise<void> {}
/* eslint-enable @typescript-eslint/no-unused-vars */
