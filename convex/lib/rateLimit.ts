import type { MutationCtx } from "../_generated/server";

const SHARDS = 10;

/**
 * Fixed-window limiter. Returns `true` and counts the hit when allowed;
 * returns `false` (without counting) once `limit` hits were made in the window.
 */
export async function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (limit <= 0) return false;
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (row === null) {
    await ctx.db.insert("rateLimits", {
      key,
      windowStart: now,
      expiresAt: now + windowMs,
      count: 1,
    });
    return true;
  }
  if (now - row.windowStart >= windowMs) {
    await ctx.db.patch(row._id, {
      windowStart: now,
      expiresAt: now + windowMs,
      count: 1,
    });
    return true;
  }
  if (row.count >= limit) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

/**
 * Limiter for global keys: spreads hits over 10 shard documents so concurrent
 * callers don't all write (and conflict on) one row. Each shard allows
 * `ceil(limit / 10)` hits, so the effective ceiling is at most `limit` rounded
 * up to a multiple of 10. Shard choice is not secret, so `Math.random` is fine.
 */
export async function checkShardedRateLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const shard = Math.floor(Math.random() * SHARDS);
  return checkRateLimit(
    ctx,
    `${key}:${shard}`,
    Math.ceil(limit / SHARDS),
    windowMs,
  );
}
