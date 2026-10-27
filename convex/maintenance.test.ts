import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function verification(createdAt: number, code: string) {
  return {
    codeNormalized: code,
    secretHash: "h",
    displayName: "x",
    status: "pending" as const,
    pinAttempts: 0,
    createdAt,
    expiresAt: createdAt + 600_000,
  };
}

test("purge deletes old rows and keeps recent ones", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("rateLimits", {
      key: "old",
      windowStart: NOW - 25 * HOUR,
      count: 1,
    });
    await ctx.db.insert("rateLimits", {
      key: "new",
      windowStart: NOW - HOUR,
      count: 1,
    });
    await ctx.db.insert("inboundMessages", {
      waMessageId: "old",
      receivedAt: NOW - 8 * 24 * HOUR,
    });
    await ctx.db.insert("inboundMessages", {
      waMessageId: "mid",
      receivedAt: NOW - 25 * HOUR,
    });
    await ctx.db.insert("inboundMessages", {
      waMessageId: "new",
      receivedAt: NOW - HOUR,
    });
    await ctx.db.insert("verifications", verification(NOW - 25 * HOUR, "OLD"));
    await ctx.db.insert("verifications", verification(NOW - HOUR, "NEW"));
  });

  await t.mutation(internal.maintenance.purge, {});

  await t.run(async (ctx) => {
    expect(
      (await ctx.db.query("rateLimits").collect()).map((r) => r.key),
    ).toEqual(["new"]);
    // inbound messages are kept for 7 days: only the 8-day-old one goes
    expect(
      (await ctx.db.query("inboundMessages").collect())
        .map((r) => r.waMessageId)
        .sort(),
    ).toEqual(["mid", "new"]);
    expect(
      (await ctx.db.query("verifications").collect()).map(
        (r) => r.codeNormalized,
      ),
    ).toEqual(["NEW"]);
  });
});

test("purge is bounded per run and reschedules itself while a backlog remains", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 501; i++) {
      await ctx.db.insert("rateLimits", {
        key: `k${i}`,
        windowStart: NOW - 30 * HOUR,
        count: 1,
      });
    }
  });

  await t.mutation(internal.maintenance.purge, {});
  await t.run(async (ctx) => {
    expect(await ctx.db.query("rateLimits").collect()).toHaveLength(1);
  });

  // the follow-up run (scheduled by the first) clears the remainder
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    expect(await ctx.db.query("rateLimits").collect()).toHaveLength(0);
  });
});

test("purge does not reschedule when nothing is left over", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("rateLimits", {
      key: "old",
      windowStart: NOW - 30 * HOUR,
      count: 1,
    });
  });
  await t.mutation(internal.maintenance.purge, {});
  const scheduled = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toHaveLength(0);
});
