import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminQuery } from "./lib/adminSession";
import { DAY_MS, dubaiDay } from "./lib/stats";
import { dayCounts, type DayCounts } from "./stats";

const ACTIVE_DAYS = 14;
const STALLED_DAYS = 14;
const ROUND_MEDIAN_DAYS = 30;
/** Stalled khatmas read at most this many open rounds; the tile says "500+". */
const STALLED_CAP = 500;

/** The rolled-up rows for days in [from, to], oldest first. */
async function rows(
  ctx: QueryCtx,
  from: number,
  to: number,
): Promise<Doc<"dailyStats">[]> {
  return await ctx.db
    .query("dailyStats")
    .withIndex("by_day", (q) => q.gte("day", from).lte("day", to))
    .collect();
}

function sum(list: Doc<"dailyStats">[], key: keyof DayCounts): number {
  return list.reduce((total, row) => total + row[key], 0);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * Sign-ins are counted on the day they finish and starts on the day they
 * begin, so one crossing midnight can push a day past 100%.
 */
const successRate = (completed: number, started: number) =>
  Math.min(1, completed / started);

async function hasActiveMember(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
): Promise<boolean> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_khatma", (q) => q.eq("khatmaId", khatmaId))
    .collect();
  return members.some((m) => m.status === "active");
}

/** Open current rounds with no finish for `STALLED_DAYS` and someone still in them (spec 6.1). */
async function stalled(
  ctx: QueryCtx,
  now: number,
): Promise<{ count: number; capped: boolean }> {
  const cutoff = now - STALLED_DAYS * DAY_MS;
  // null sorts before numbers, so never-finished rounds are in this range too.
  const quiet = await ctx.db
    .query("rounds")
    .withIndex("by_open_lastFinishedAt", (q) =>
      q.eq("completedAt", null).lt("lastFinishedAt", cutoff),
    )
    .take(STALLED_CAP + 1);
  let count = 0;
  for (const round of quiet.slice(0, STALLED_CAP)) {
    if (round.lastFinishedAt === null && round.startedAt >= cutoff) continue;
    const khatma = await ctx.db.get(round.khatmaId);
    if (khatma?.currentRoundId !== round._id) continue;
    if (!(await hasActiveMember(ctx, khatma._id))) continue;
    count++;
  }
  return { count, capped: quiet.length > STALLED_CAP };
}

/** The front page numbers (spec 6.1). Group totals only. */
export const overview = adminQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const today = dubaiDay(now);
    const live = await dayCounts(ctx, today);
    const latest = await ctx.db
      .query("dailyStats")
      .withIndex("by_day")
      .order("desc")
      .first();
    const week = await rows(ctx, today - 7, today - 1);
    const lastSix = week.filter((r) => r.day >= today - 6);

    const activeRounds = await ctx.db
      .query("rounds")
      .withIndex("by_lastFinishedAt", (q) =>
        q.gt("lastFinishedAt", now - ACTIVE_DAYS * DAY_MS),
      )
      .collect();
    // Stored by the nightly rollup, so no 14-day read happens here.
    const weekAgo = await ctx.db
      .query("dailyStats")
      .withIndex("by_day", (q) => q.eq("day", today - 7))
      .first();

    const completed = await ctx.db
      .query("rounds")
      .withIndex("by_completedAt", (q) =>
        q.gt("completedAt", now - ROUND_MEDIAN_DAYS * DAY_MS),
      )
      .collect();
    const stall = await stalled(ctx, now);

    const started = sum(lastSix, "signInsStarted") + live.signInsStarted;
    const signedIn = sum(lastSix, "signInsCompleted") + live.signInsCompleted;
    const medianDays = median(
      completed.map((r) => ((r.completedAt ?? now) - r.startedAt) / DAY_MS),
    );

    return {
      activeKhatmas: new Set(activeRounds.map((r) => r.khatmaId)).size,
      activeKhatmasWeekAgo: weekAgo?.activeKhatmas ?? null,
      members: (latest?.totalMembers ?? 0) + live.newMembers,
      membersNewThisWeek: sum(lastSix, "newMembers") + live.newMembers,
      ajzaToday: live.ajzaFinished,
      ajzaAvg7: oneDecimal(sum(week, "ajzaFinished") / 7),
      completedThisWeek: sum(lastSix, "roundsCompleted") + live.roundsCompleted,
      stalledKhatmas: stall.count,
      stalledCapped: stall.capped,
      daysPerRoundMedian: medianDays === null ? null : oneDecimal(medianDays),
      signInSuccess7: started === 0 ? null : successRate(signedIn, started),
    };
  },
});

const metricValidator = v.union(
  v.literal("ajzaFinished"),
  v.literal("newMembers"),
  v.literal("newKhatmas"),
  v.literal("roundsCompleted"),
  v.literal("signInRate"),
);

/** One value per day ending yesterday, oldest first; null for a day with no row. */
export const trend = adminQuery({
  args: {
    metric: metricValidator,
    days: v.union(v.literal(7), v.literal(30), v.literal(365)),
  },
  handler: async (ctx, args) => {
    const yesterday = dubaiDay(Date.now()) - 1;
    const first = yesterday - args.days + 1;
    const byDay = new Map(
      (await rows(ctx, first, yesterday)).map((r) => [r.day, r] as const),
    );
    const points: { day: number; value: number | null }[] = [];
    for (let day = first; day <= yesterday; day++) {
      const row = byDay.get(day);
      let value: number | null = null;
      if (row) {
        value =
          args.metric === "signInRate"
            ? row.signInsStarted === 0
              ? null
              : successRate(row.signInsCompleted, row.signInsStarted)
            : row[args.metric];
      }
      points.push({ day, value });
    }
    return points;
  },
});
