import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { ADMIN_SESSION_TTL_MS } from "./lib/adminSession";
import { sha256Hex } from "./lib/crypto";
import { dayStart, dubaiDay } from "./lib/stats";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TODAY = dubaiDay(Date.parse("2026-10-20T08:00:00Z"));
const NOW = dayStart(TODAY) + 12 * HOUR;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

async function admin(t: T) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", {
      phone: "+971500000099",
      addedBy: null,
      addedAt: 0,
    }),
  );
  const tokenHash = await sha256Hex("admin");
  await t.run((ctx) =>
    ctx.db.insert("adminSessions", {
      adminId,
      tokenHash,
      alertTokenHash: tokenHash,
      deviceLabel: "x",
      createdAt: NOW,
      expiresAt: NOW + ADMIN_SESSION_TTL_MS,
    }),
  );
}

const overview = (t: T) =>
  t.query(api.adminStats.overview, { adminToken: "admin" });

let seq = 0;
async function khatmaWithRound(
  t: T,
  round: {
    startedAt: number;
    lastFinishedAt: number | null;
    completedAt?: number | null;
  },
  activeMembers = 1,
) {
  seq++;
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: `+97150000${String(seq).padStart(4, "0")}`,
      displayName: "س",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    });
    const khatmaId = await ctx.db.insert("khatmas", {
      name: null,
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: personId,
      inviteCode: `k${String(seq).padStart(11, "0")}`,
      completedRounds: 0,
      createdAt: 0,
    });
    const roundId = await ctx.db.insert("rounds", {
      khatmaId,
      number: 1,
      startedAt: round.startedAt,
      targetEndAt: null,
      completedAt: round.completedAt ?? null,
      lastFinishedAt: round.lastFinishedAt,
      behindInvitedAt: null,
    });
    await ctx.db.patch(khatmaId, { currentRoundId: roundId });
    for (let i = 0; i < activeMembers; i++) {
      await ctx.db.insert("members", {
        khatmaId,
        personId,
        joinedAt: 0,
        status: "active",
        notificationsOn: false,
        lastNudgeAt: null,
        lastCelebratedRound: 0,
      });
    }
    return { khatmaId, roundId, personId };
  });
}

async function finishAt(
  t: T,
  k: { khatmaId: Id<"khatmas">; roundId: Id<"rounds">; personId: Id<"people"> },
  at: number,
) {
  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", k.khatmaId))
      .first();
    await ctx.db.insert("assignments", {
      khatmaId: k.khatmaId,
      roundId: k.roundId,
      roundNumber: 1,
      juz: 1,
      memberId: member!._id,
      personId: k.personId,
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

function day(t: T, d: number, fields: Partial<Record<string, number>>) {
  return t.run((ctx) =>
    ctx.db.insert("dailyStats", {
      day: d,
      ajzaFinished: 0,
      newMembers: 0,
      newKhatmas: 0,
      roundsCompleted: 0,
      signInsStarted: 0,
      signInsCompleted: 0,
      totalMembers: 0,
      totalKhatmas: 0,
      totalRoundsCompleted: 0,
      computedAt: 0,
      ...fields,
    }),
  );
}

test("with no stats yet the dashboard shows zeros, not an error", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  expect(await overview(t)).toEqual({
    activeKhatmas: 0,
    activeKhatmasWeekAgo: null,
    members: 0,
    membersNewThisWeek: 0,
    ajzaToday: 0,
    ajzaAvg7: 0,
    completedThisWeek: 0,
    stalledKhatmas: 0,
    stalledCapped: false,
    daysPerRoundMedian: null,
    signInSuccess7: null,
  });
});

test("the week-ago active count comes from the stored daily row", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await day(t, TODAY - 7, { activeKhatmas: 9 });
  expect((await overview(t)).activeKhatmasWeekAgo).toBe(9);
});

test("active khatmas: a finish in the last 14 days", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await khatmaWithRound(t, {
    startedAt: NOW - 30 * DAY,
    lastFinishedAt: NOW - 3 * DAY,
  });
  await khatmaWithRound(t, {
    startedAt: NOW - 30 * DAY,
    lastFinishedAt: NOW - 20 * DAY,
  });
  const both = await khatmaWithRound(t, {
    startedAt: NOW - 30 * DAY,
    lastFinishedAt: NOW - DAY,
  });
  await finishAt(t, both, NOW - DAY);

  const o = await overview(t);
  expect(o.activeKhatmas).toBe(2);
  // No stored row from a week ago: nothing to compare.
  expect(o.activeKhatmasWeekAgo).toBeNull();
});

test("stalled khatmas: an open current round, a member, and 14 quiet days", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await khatmaWithRound(t, {
    startedAt: NOW - 30 * DAY,
    lastFinishedAt: NOW - 15 * DAY,
  });
  await khatmaWithRound(t, { startedAt: NOW - 15 * DAY, lastFinishedAt: null });
  await khatmaWithRound(t, { startedAt: NOW - 3 * DAY, lastFinishedAt: null });
  await khatmaWithRound(
    t,
    { startedAt: NOW - 30 * DAY, lastFinishedAt: NOW - 15 * DAY },
    0,
  );
  await khatmaWithRound(t, {
    startedAt: NOW - 30 * DAY,
    lastFinishedAt: NOW - 15 * DAY,
    completedAt: NOW - 15 * DAY,
  });
  expect((await overview(t)).stalledKhatmas).toBe(2);
});

test("days per round is the median over the last 30 days", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  for (const days of [2, 4, 10]) {
    await khatmaWithRound(t, {
      startedAt: NOW - 20 * DAY - days * DAY,
      lastFinishedAt: NOW - 20 * DAY,
      completedAt: NOW - 20 * DAY,
    });
  }
  await khatmaWithRound(t, {
    startedAt: NOW - 100 * DAY,
    lastFinishedAt: NOW - 40 * DAY,
    completedAt: NOW - 40 * DAY,
  });
  expect((await overview(t)).daysPerRoundMedian).toBe(4);
});

test("totals, the week, and sign-in success come from the daily rows", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await day(t, TODAY - 8, { totalMembers: 90 });
  for (let d = TODAY - 7; d < TODAY; d++) {
    await day(t, d, {
      ajzaFinished: 7,
      newMembers: 2,
      roundsCompleted: d >= TODAY - 6 ? 1 : 0,
      signInsStarted: d === TODAY - 1 ? 8 : 0,
      signInsCompleted: d === TODAY - 1 ? 6 : 0,
      totalMembers: 90 + 2 * (d - (TODAY - 8)),
    });
  }
  const o = await overview(t);
  expect(o.members).toBe(104);
  expect(o.membersNewThisWeek).toBe(12);
  expect(o.ajzaAvg7).toBe(7);
  expect(o.completedThisWeek).toBe(6);
  expect(o.signInSuccess7).toBe(0.75);
});

test("trend returns one entry per day, oldest first, with gaps as null", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await day(t, TODAY - 1, {
    ajzaFinished: 5,
    signInsStarted: 4,
    signInsCompleted: 3,
  });
  await day(t, TODAY - 3, { ajzaFinished: 2 });
  const ajza = await t.query(api.adminStats.trend, {
    adminToken: "admin",
    metric: "ajzaFinished",
    days: 7,
  });
  expect(ajza).toHaveLength(7);
  expect(ajza.at(-1)).toEqual({ day: TODAY - 1, value: 5 });
  expect(ajza.at(-2)).toEqual({ day: TODAY - 2, value: null });
  expect(ajza.at(-3)).toEqual({ day: TODAY - 3, value: 2 });
  const rate = await t.query(api.adminStats.trend, {
    adminToken: "admin",
    metric: "signInRate",
    days: 7,
  });
  expect(rate.at(-1)?.value).toBe(0.75);
  expect(rate.at(-3)?.value).toBeNull();
});

test("only admins can read stats", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.adminStats.overview, { adminToken: "member" }),
  ).rejects.toThrow(/not_admin/);
});

test("sign-in success covers today and the six days before it", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await day(t, TODAY - 7, { signInsStarted: 10, signInsCompleted: 0 });
  await day(t, TODAY - 1, { signInsStarted: 4, signInsCompleted: 3 });
  expect((await overview(t)).signInSuccess7).toBe(0.75);
});

test("sign-in success never reads above 100%", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  // A code started before midnight and completed after it.
  await day(t, TODAY - 1, { signInsStarted: 2, signInsCompleted: 3 });
  expect((await overview(t)).signInSuccess7).toBe(1);
  const rate = await t.query(api.adminStats.trend, {
    adminToken: "admin",
    metric: "signInRate",
    days: 7,
  });
  expect(rate.at(-1)?.value).toBe(1);
});
