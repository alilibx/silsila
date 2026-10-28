import type { QueryCtx } from "../_generated/server";

/** True when an admin blocked this number app-wide (spec 8). */
export async function isBlocked(
  ctx: QueryCtx,
  phone: string,
): Promise<boolean> {
  return (
    (await ctx.db
      .query("blockedPhones")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first()) !== null
  );
}
