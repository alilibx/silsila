import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { toArabicDigits } from "./lib/digits";
import { milestonesFor, type MilestoneMetric } from "./lib/milestones";
import { getSetting } from "./lib/settings";
import {
  bumpCounter,
  dayStart,
  dubaiDay,
  readCounter,
  signInKey,
} from "./lib/stats";

/** The nightly run fills at most this many missed days, then continues. */
const CATCH_UP_DAYS = 31;

export type DayCounts = {
  ajzaFinished: number;
  newMembers: number;
  newKhatmas: number;
  roundsCompleted: number;
  signInsStarted: number;
  signInsCompleted: number;
};

/**
 * One Dubai day's counts, from index ranges over that day only (spec 6.2):
 * nothing here reads a whole table.
 */
export async function dayCounts(
  ctx: QueryCtx,
  day: number,
): Promise<DayCounts> {
  const from = dayStart(day);
  const to = dayStart(day + 1);
  const finished = await ctx.db
    .query("assignments")
    .withIndex("by_finishedAt", (q) =>
      q.gte("finishedAt", from).lt("finishedAt", to),
    )
    .collect();
  const people = await ctx.db
    .query("people")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", from).lt("_creationTime", to),
    )
    .collect();
  const khatmas = await ctx.db
    .query("khatmas")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", from).lt("_creationTime", to),
    )
    .collect();
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_completedAt", (q) =>
      q.gte("completedAt", from).lt("completedAt", to),
    )
    .collect();
  return {
    ajzaFinished: finished.length,
    newMembers: people.length,
    newKhatmas: khatmas.length,
    roundsCompleted: rounds.length,
    signInsStarted: await readCounter(ctx, signInKey(day, "started")),
    signInsCompleted: await readCounter(ctx, signInKey(day, "completed")),
  };
}

async function rowFor(
  ctx: QueryCtx,
  day: number,
): Promise<Doc<"dailyStats"> | null> {
  return await ctx.db
    .query("dailyStats")
    .withIndex("by_day", (q) => q.eq("day", day))
    .first();
}

/** The newest row before `day`, whose totals this day builds on. */
async function rowBefore(
  ctx: QueryCtx,
  day: number,
): Promise<Doc<"dailyStats"> | null> {
  return await ctx.db
    .query("dailyStats")
    .withIndex("by_day", (q) => q.lt("day", day))
    .order("desc")
    .first();
}

/** Writes (or rewrites) one day's row. Running it twice gives the same row. */
async function writeDay(ctx: MutationCtx, day: number): Promise<void> {
  const counts = await dayCounts(ctx, day);
  const before = await rowBefore(ctx, day);
  const row = {
    day,
    ...counts,
    totalMembers: (before?.totalMembers ?? 0) + counts.newMembers,
    totalKhatmas: (before?.totalKhatmas ?? 0) + counts.newKhatmas,
    totalRoundsCompleted:
      (before?.totalRoundsCompleted ?? 0) + counts.roundsCompleted,
    computedAt: Date.now(),
  };
  const existing = await rowFor(ctx, day);
  if (existing) await ctx.db.replace(existing._id, row);
  else await ctx.db.insert("dailyStats", row);
}

export const rollupDay = internalMutation({
  args: { day: v.number() },
  handler: async (ctx, args) => {
    await writeDay(ctx, args.day);
  },
});

/**
 * Nightly at 00:10 Dubai: rolls up every day after the newest row through
 * yesterday, so a missed night never leaves a hole in the totals. An empty
 * table is the backfill's job.
 */
export const rollupYesterday = internalMutation({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("dailyStats")
      .withIndex("by_day")
      .order("desc")
      .first();
    if (!latest) return;
    const yesterday = dubaiDay(Date.now()) - 1;
    const last = Math.min(yesterday, latest.day + CATCH_UP_DAYS);
    for (let day = latest.day + 1; day <= last; day++) {
      await writeDay(ctx, day);
    }
    if (last < yesterday) {
      await ctx.scheduler.runAfter(0, internal.stats.rollupYesterday, {});
    }
  },
});

/** The Dubai day of the oldest person or khatma, or null on an empty deployment. */
export const firstDay = internalQuery({
  args: {},
  handler: async (ctx): Promise<number | null> => {
    const person = await ctx.db.query("people").order("asc").first();
    const khatma = await ctx.db.query("khatmas").order("asc").first();
    const times = [person?._creationTime, khatma?._creationTime].filter(
      (t): t is number => t !== undefined,
    );
    return times.length === 0 ? null : dubaiDay(Math.min(...times));
  },
});

/**
 * One-off, from the command line after the first deploy of plan 3c:
 * `bun run convex run stats:backfill --deployment …`. Safe to run again.
 */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ days: number }> => {
    const first = await ctx.runQuery(internal.stats.firstDay, {});
    if (first === null) return { days: 0 };
    const yesterday = dubaiDay(Date.now()) - 1;
    let days = 0;
    for (let day = first; day <= yesterday; day++) {
      await ctx.runMutation(internal.stats.rollupDay, { day });
      days++;
    }
    // Launch shouldn't fire a burst of old milestones.
    await ctx.runMutation(internal.stats.markPassedMilestones, {});
    return { days };
  },
});

// ---------------------------------------------------------------------------
// Admin pushes: the morning summary and milestones (spec 7)

const HOUR_MS = 3_600_000;
const LAST_MILESTONE_PUSH = "milestone:lastPushAt";
const METRICS: MilestoneMetric[] = ["khatmas", "members", "completed"];
const NOUN: Record<MilestoneMetric, string> = {
  khatmas: "ختمة",
  members: "عضو",
  completed: "ختمة مكتملة",
};

const n = (value: number) => toArabicDigits(value);

/** The three totals now: the newest row's plus today's live counts. */
async function totals(ctx: QueryCtx): Promise<Record<MilestoneMetric, number>> {
  const today = dubaiDay(Date.now());
  const live = await dayCounts(ctx, today);
  const latest = await ctx.db
    .query("dailyStats")
    .withIndex("by_day")
    .order("desc")
    .first();
  return {
    khatmas: (latest?.totalKhatmas ?? 0) + live.newKhatmas,
    members: (latest?.totalMembers ?? 0) + live.newMembers,
    completed: (latest?.totalRoundsCompleted ?? 0) + live.roundsCompleted,
  };
}

/** Records every reached milestone not sent yet; returns them, smallest first. */
async function markNew(
  ctx: MutationCtx,
  metric: MilestoneMetric,
  total: number,
): Promise<number[]> {
  const fresh: number[] = [];
  for (const value of milestonesFor(metric, total)) {
    const sent = await ctx.db
      .query("milestonesSent")
      .withIndex("by_metric_value", (q) =>
        q.eq("metric", metric).eq("value", value),
      )
      .first();
    if (sent) continue;
    await ctx.db.insert("milestonesSent", {
      metric,
      value,
      sentAt: Date.now(),
    });
    fresh.push(value);
  }
  return fresh;
}

/** Every 10 minutes: pushes the highest new milestone, spaced (spec 7). */
export const checkMilestones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const current = await totals(ctx);
    let best: { metric: MilestoneMetric; value: number } | null = null;
    for (const metric of METRICS) {
      const fresh = await markNew(ctx, metric, current[metric]);
      const top = fresh.at(-1);
      if (top !== undefined && best === null) best = { metric, value: top };
    }
    if (best === null) return;
    const spacing = await getSetting(ctx, "milestonePushSpacingMs");
    const lastPushAt = await readCounter(ctx, LAST_MILESTONE_PUSH);
    if (now - lastPushAt < spacing) return;
    await bumpCounter(ctx, LAST_MILESTONE_PUSH, now - lastPushAt);
    const others = METRICS.filter((m) => m !== best.metric)
      .map((m) => `${n(current[m])} ${NOUN[m]}`)
      .join(" · ");
    await ctx.scheduler.runAfter(0, internal.pushNode.deliverToAdmins, {
      kind: "milestone",
      body: `🎉 وصلنا ${n(best.value)} ${NOUN[best.metric]}\n${others}`,
      tag: `milestone-${best.metric}-${best.value}`,
    });
  },
});

/** Marks every milestone already reached as sent, without pushing (the backfill). */
export const markPassedMilestones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const current = await totals(ctx);
    for (const metric of METRICS) await markNew(ctx, metric, current[metric]);
  },
});

/** Hourly: at `summaryHour` Dubai time, once a day, yesterday in one push (spec 7). */
export const morningSummary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = dubaiDay(now);
    const hour = Math.floor((now - dayStart(today)) / HOUR_MS);
    if (hour !== (await getSetting(ctx, "summaryHour"))) return;
    const key = `summary:${today}`;
    if ((await readCounter(ctx, key)) > 0) return;
    await bumpCounter(ctx, key);
    const yesterday = await ctx.db
      .query("dailyStats")
      .withIndex("by_day", (q) => q.eq("day", today - 1))
      .first();
    if (!yesterday) return;
    const openHelp = (
      await ctx.db
        .query("helpRequests")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .take(100)
    ).length;
    await ctx.scheduler.runAfter(0, internal.pushNode.deliverToAdmins, {
      kind: "summary",
      body: `أمس: ${n(yesterday.newKhatmas)} ختمة جديدة · ${n(yesterday.newMembers)} عضواً جديداً · ${n(yesterday.ajzaFinished)} جزءاً · ${n(yesterday.roundsCompleted)} ختمة مكتملة · طلبات مساعدة مفتوحة: ${n(openHelp)}`,
      tag: `summary-${today}`,
    });
  },
});
