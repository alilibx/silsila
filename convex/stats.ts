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
import { dayStart, dubaiDay, readCounter, signInKey } from "./lib/stats";

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
    return { days };
  },
});
