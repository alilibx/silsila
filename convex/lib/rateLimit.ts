import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

const SHARDS = 10;

/** One fixed-window bucket: at most `limit` hits per `windowMs` under `key`. */
export type RateLimitBucket = {
  key: string;
  limit: number;
  windowMs: number;
};

function loadRow(
  ctx: MutationCtx,
  key: string,
): Promise<Doc<"rateLimits"> | null> {
  return ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

/** Whether one more hit fits in the bucket at `now`. Reads only. */
function allows(
  row: Doc<"rateLimits"> | null,
  { limit, windowMs }: RateLimitBucket,
  now: number,
): boolean {
  if (limit <= 0) return false;
  if (row === null || now - row.windowStart >= windowMs) return true;
  return row.count < limit;
}

/** Counts one hit, opening a fresh window when there is none or it has ended. */
async function count(
  ctx: MutationCtx,
  row: Doc<"rateLimits"> | null,
  { key, windowMs }: RateLimitBucket,
  now: number,
): Promise<void> {
  if (row === null) {
    await ctx.db.insert("rateLimits", {
      key,
      windowStart: now,
      expiresAt: now + windowMs,
      count: 1,
    });
  } else if (now - row.windowStart >= windowMs) {
    await ctx.db.patch(row._id, {
      windowStart: now,
      expiresAt: now + windowMs,
      count: 1,
    });
  } else {
    await ctx.db.patch(row._id, { count: row.count + 1 });
  }
}

/**
 * Checks every bucket first and counts the hit in all of them only when all
 * allow it, so a refusal by one bucket never spends another's budget. Keys
 * must be distinct.
 */
export async function checkRateLimits(
  ctx: MutationCtx,
  buckets: readonly RateLimitBucket[],
): Promise<boolean> {
  const now = Date.now();
  const rows = await Promise.all(buckets.map((b) => loadRow(ctx, b.key)));
  if (!buckets.every((b, i) => allows(rows[i] ?? null, b, now))) return false;
  await Promise.all(buckets.map((b, i) => count(ctx, rows[i] ?? null, b, now)));
  return true;
}

/**
 * Fixed-window limiter. Returns `true` and counts the hit when allowed;
 * returns `false` (without counting) once `limit` hits were made in the window.
 */
export function checkRateLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return checkRateLimits(ctx, [{ key, limit, windowMs }]);
}

/**
 * The bucket for one hit on a global key: one of 10 shard documents, so
 * concurrent callers don't all write (and conflict on) one row. Each shard
 * allows `ceil(limit / 10)` hits, so the effective ceiling is at most `limit`
 * rounded up to a multiple of 10. Shard choice is not secret, so
 * `Math.random` is fine.
 */
export function shardedBucket(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitBucket {
  const shard = Math.floor(Math.random() * SHARDS);
  return {
    key: `${key}:${shard}`,
    limit: Math.ceil(limit / SHARDS),
    windowMs,
  };
}

/** `checkRateLimit` on a global key, spread over shards (see `shardedBucket`). */
export function checkShardedRateLimit(
  ctx: MutationCtx,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  return checkRateLimits(ctx, [shardedBucket(key, limit, windowMs)]);
}
