import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { bumpCounter, dayStart, dubaiDay, signInKey } from "./lib/stats";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 3_600_000;
// A fixed Dubai day D, and noon on it.
const D = dubaiDay(Date.parse("2026-10-20T08:00:00Z"));
const noon = (day: number) => dayStart(day) + 12 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(noon(D));
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

async function person(t: T, at: number, phone: string) {
  vi.setSystemTime(at);
  return await t.run((ctx) =>
    ctx.db.insert("people", {
      phone,
      displayName: "س",
      verifiedAt: at,
      timeZone: "Asia/Dubai",
      lastSeenAt: at,
    }),
  );
}

async function khatma(t: T, at: number, creator: Id<"people">) {
  vi.setSystemTime(at);
  return await t.run((ctx) =>
    ctx.db.insert("khatmas", {
      name: null,
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: creator,
      inviteCode: `code${at}`.slice(0, 12),
      completedRounds: 0,
      createdAt: at,
    }),
  );
}

async function round(
  t: T,
  khatmaId: Id<"khatmas">,
  completedAt: number | null,
) {
  return await t.run((ctx) =>
    ctx.db.insert("rounds", {
      khatmaId,
      number: 1,
      startedAt: noon(D) - 5 * 24 * HOUR,
      targetEndAt: null,
      completedAt,
      lastFinishedAt: null,
      behindInvitedAt: null,
    }),
  );
}

async function finish(
  t: T,
  khatmaId: Id<"khatmas">,
  roundId: Id<"rounds">,
  personId: Id<"people">,
  at: number,
) {
  await t.run(async (ctx) => {
    const memberId = await ctx.db.insert("members", {
      khatmaId,
      personId,
      joinedAt: 0,
      status: "active",
      notificationsOn: false,
      lastNudgeAt: null,
      lastCelebratedRound: 0,
    });
    await ctx.db.insert("assignments", {
      khatmaId,
      roundId,
      roundNumber: 1,
      juz: Math.floor(Math.random() * 30) + 1,
      memberId,
      personId,
      takenAt: at - HOUR,
      finishedAt: at,
      releasedAt: null,
      releasedBySystem: false,
      graceWakingMs: HOUR,
      noticeAt: at,
      graceEndsAt: at + HOUR,
      extended: false,
      noticeSentAt: null,
      openedForHelpAt: null,
      remindedAt: null,
    });
  });
}

function rows(t: T) {
  return t.run((ctx) =>
    ctx.db.query("dailyStats").withIndex("by_day").collect(),
  );
}

async function seed(t: T) {
  const p = await person(t, noon(D), "+971500000001");
  const k = await khatma(t, noon(D) + 1000, p);
  const r = await round(t, k, noon(D) + 2000);
  await finish(t, k, r, p, noon(D) + 3000);
  await finish(t, k, r, p, noon(D) + 4000);
  await finish(t, k, r, p, noon(D + 1));
  await t.run(async (ctx) => {
    await bumpCounter(ctx, signInKey(D, "started"), 4);
    await bumpCounter(ctx, signInKey(D, "completed"), 3);
  });
  return { p, k, r };
}

test("a day's row has its counts and the totals so far", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await t.mutation(internal.stats.rollupDay, { day: D });
  expect(await rows(t)).toMatchObject([
    {
      day: D,
      ajzaFinished: 2,
      newMembers: 1,
      newKhatmas: 1,
      roundsCompleted: 1,
      signInsStarted: 4,
      signInsCompleted: 3,
      totalMembers: 1,
      totalKhatmas: 1,
      totalRoundsCompleted: 1,
    },
  ]);
});

test("quiet days carry the totals forward, and reruns change nothing", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await t.mutation(internal.stats.rollupDay, { day: D });
  await t.mutation(internal.stats.rollupDay, { day: D + 1 });
  await t.mutation(internal.stats.rollupDay, { day: D + 2 });
  await t.mutation(internal.stats.rollupDay, { day: D });
  await t.mutation(internal.stats.rollupDay, { day: D + 2 });

  const all = await rows(t);
  expect(all.map((r) => r.day)).toEqual([D, D + 1, D + 2]);
  expect(all[0]).toMatchObject({ signInsStarted: 4, totalMembers: 1 });
  expect(all[1]).toMatchObject({ ajzaFinished: 1, totalKhatmas: 1 });
  expect(all[2]).toMatchObject({
    ajzaFinished: 0,
    newMembers: 0,
    totalMembers: 1,
    totalKhatmas: 1,
    totalRoundsCompleted: 1,
  });
});

test("the nightly run catches up every day missed since the last row", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await t.mutation(internal.stats.rollupDay, { day: D - 3 });
  vi.setSystemTime(noon(D + 1));
  await t.mutation(internal.stats.rollupYesterday, {});
  const all = await rows(t);
  expect(all.map((r) => r.day)).toEqual([D - 3, D - 2, D - 1, D]);
  expect(all.at(-1)).toMatchObject({ totalMembers: 1, ajzaFinished: 2 });
});

test("the nightly run leaves an empty table to the backfill", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  vi.setSystemTime(noon(D + 1));
  await t.mutation(internal.stats.rollupYesterday, {});
  expect(await rows(t)).toEqual([]);
});

test("the backfill writes every day from the first one to yesterday", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  vi.setSystemTime(noon(D + 3));
  await t.action(internal.stats.backfill, {});
  const all = await rows(t);
  expect(all.map((r) => r.day)).toEqual([D, D + 1, D + 2]);
  expect(all.at(-1)).toMatchObject({
    totalMembers: 1,
    totalKhatmas: 1,
    totalRoundsCompleted: 1,
  });
});

test("purge drops sign-in counters a week after their day", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await bumpCounter(ctx, signInKey(D - 8, "started"));
    await bumpCounter(ctx, signInKey(D - 6, "started"));
    await bumpCounter(ctx, "summary:1");
  });
  await t.mutation(internal.maintenance.purge, {});
  const keys = await t.run(async (ctx) =>
    (await ctx.db.query("counters").collect()).map((c) => c.key),
  );
  expect(keys.sort()).toEqual(
    [signInKey(D - 6, "started"), "summary:1"].sort(),
  );
});
