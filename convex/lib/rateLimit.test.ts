import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../schema";
import {
  checkRateLimit,
  checkRateLimits,
  checkShardedRateLimit,
  shardedBucket,
} from "./rateLimit";

const modules = import.meta.glob("../**/*.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("allows `limit` hits per window", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++)
      expect(await checkRateLimit(ctx, "k", 3, 60_000)).toBe(true);
    expect(await checkRateLimit(ctx, "k", 3, 60_000)).toBe(false);
  });
});

test("keys are independent", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    expect(await checkRateLimit(ctx, "a", 1, 60_000)).toBe(true);
    expect(await checkRateLimit(ctx, "a", 1, 60_000)).toBe(false);
    expect(await checkRateLimit(ctx, "b", 1, 60_000)).toBe(true);
  });
});

test("window resets after windowMs", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const t = convexTest(schema, modules);
  // Date.now() is frozen within one Convex function, so advance time between calls.
  const hit = () => t.run((ctx) => checkRateLimit(ctx, "k", 1, 60_000));
  expect(await hit()).toBe(true);
  expect(await hit()).toBe(false);
  vi.setSystemTime(1_000_000 + 59_999);
  expect(await hit()).toBe(false);
  vi.setSystemTime(1_000_000 + 60_000);
  expect(await hit()).toBe(true);
  expect(await hit()).toBe(false);
  // the reset also moves expiresAt forward
  const row = await t.run(async (ctx) => ctx.db.query("rateLimits").first());
  expect(row?.windowStart).toBe(1_060_000);
  expect(row?.expiresAt).toBe(1_120_000);
});

test("refused hits are not counted", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await checkRateLimit(ctx, "k", 1, 60_000);
    await checkRateLimit(ctx, "k", 1, 60_000);
    await checkRateLimit(ctx, "k", 1, 60_000);
    const rows = await ctx.db.query("rateLimits").collect();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(1);
  });
});

test("sharded limiter allows ceil(limit/10) per shard", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.35); // shard 3
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // limit 10 -> 1 per shard
    expect(await checkShardedRateLimit(ctx, "g", 10, 60_000)).toBe(true);
    expect(await checkShardedRateLimit(ctx, "g", 10, 60_000)).toBe(false);
    const rows = await ctx.db.query("rateLimits").collect();
    expect(rows.map((r) => r.key)).toEqual(["g:3"]);
  });
});

test("sharded limiter rounds the per-shard allowance up", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0.99); // shard 9
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // limit 25 -> 3 per shard
    for (let i = 0; i < 3; i++)
      expect(await checkShardedRateLimit(ctx, "g", 25, 60_000)).toBe(true);
    expect(await checkShardedRateLimit(ctx, "g", 25, 60_000)).toBe(false);
    const rows = await ctx.db.query("rateLimits").collect();
    expect(rows.map((r) => r.key)).toEqual(["g:9"]);
  });
});

test("sharded limiter spreads across shards 0..9", async () => {
  const random = vi.spyOn(Math, "random");
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let n = 0; n < 10; n++) {
      random.mockReturnValue(n / 10 + 0.01);
      expect(await checkShardedRateLimit(ctx, "g", 10, 60_000)).toBe(true);
    }
    const rows = await ctx.db.query("rateLimits").collect();
    expect(rows.map((r) => r.key).sort()).toEqual(
      Array.from({ length: 10 }, (_, n) => `g:${n}`),
    );
  });
});

test("checkRateLimits counts every bucket only when all of them allow", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const a = { key: "a", limit: 5, windowMs: 60_000 };
    const b = { key: "b", limit: 1, windowMs: 60_000 };
    expect(await checkRateLimits(ctx, [a, b])).toBe(true);
    // b refuses, so a is not charged either
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimits(ctx, [a, b])).toBe(false);
    }
    const counts = Object.fromEntries(
      (await ctx.db.query("rateLimits").collect()).map((r) => [r.key, r.count]),
    );
    expect(counts).toEqual({ a: 1, b: 1 });
  });
});

test("checkRateLimits refuses a bucket with no allowance and writes nothing", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    expect(
      await checkRateLimits(ctx, [
        { key: "a", limit: 5, windowMs: 60_000 },
        { key: "b", limit: 0, windowMs: 60_000 },
      ]),
    ).toBe(false);
    expect(await ctx.db.query("rateLimits").collect()).toEqual([]);
  });
});

test("shardedBucket picks one shard with ceil(limit/10) hits", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.42);
  expect(shardedBucket("g", 25, 60_000)).toEqual({
    key: "g:4",
    limit: 3,
    windowMs: 60_000,
  });
});
