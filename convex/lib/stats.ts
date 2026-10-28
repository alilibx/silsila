import type { MutationCtx, QueryCtx } from "../_generated/server";
import { localDayNumber } from "./wakingTime";

/** Stats count days in the app's default zone (plan 3 spec 6.1). */
export const STATS_TZ = "Asia/Dubai";
export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Dubai is UTC+4 all year (no daylight saving). */
const DUBAI_OFFSET_MS = 4 * HOUR_MS;

/** The Dubai calendar day of an instant, as days since 1970-01-01. */
export function dubaiDay(at: number): number {
  return localDayNumber(at, STATS_TZ);
}

/** The instant a Dubai day begins. */
export function dayStart(day: number): number {
  return day * DAY_MS - DUBAI_OFFSET_MS;
}

export async function readCounter(ctx: QueryCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return row?.value ?? 0;
}

export async function bumpCounter(
  ctx: MutationCtx,
  key: string,
  by = 1,
): Promise<void> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (row) await ctx.db.patch(row._id, { value: row.value + by });
  else await ctx.db.insert("counters", { key, value: by });
}

export async function setCounter(
  ctx: MutationCtx,
  key: string,
  value: number,
): Promise<void> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (row) await ctx.db.patch(row._id, { value });
  else await ctx.db.insert("counters", { key, value });
}

/** Set once the backfill has marked past milestones; until then none are pushed. */
export const BACKFILLED_AT = "stats:backfilledAt";

/** The counter key for one day's sign-ins (verifications are purged after a day). */
export function signInKey(day: number, kind: "started" | "completed"): string {
  return `signin:${day}:${kind}`;
}
