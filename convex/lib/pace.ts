import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getSetting } from "./settings";
import { localDayNumber } from "./wakingTime";

const DAY_MS = 86_400_000;
/** The most finished rows read to find a person's pace. */
const PACE_SCAN_ROWS = 50;

export type PaceSettings = {
  defaultPaceMs: number;
  paceMinMs: number;
  paceMaxMs: number;
  paceMinCountedMs: number;
  paceSampleSize: number;
  paceMinFinishes: number;
};

export type Pace = { paceMs: number; known: boolean };

/**
 * A person's pace (v1 spec 4.1): the median of their last `paceSampleSize`
 * counted finishes, kept between the bounds. `durationsNewestFirst` are
 * take-to-finish times; those under `paceMinCountedMs` say nothing and are
 * dropped. The pace is `known` once `paceMinFinishes` finishes count.
 */
export function paceFrom(
  durationsNewestFirst: readonly number[],
  s: PaceSettings,
): Pace {
  const counted = durationsNewestFirst
    .filter((d) => d >= s.paceMinCountedMs)
    .slice(0, s.paceSampleSize);
  if (counted.length === 0) return { paceMs: s.defaultPaceMs, known: false };
  const sorted = [...counted].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] as number)
      : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  const clamped = Math.min(s.paceMaxMs, Math.max(s.paceMinMs, median));
  return counted.length >= s.paceMinFinishes
    ? { paceMs: clamped, known: true }
    : // fewer than the minimum: the default holds until enough finishes count
      { paceMs: s.defaultPaceMs, known: false };
}

export async function paceSettings(ctx: QueryCtx): Promise<PaceSettings> {
  return {
    defaultPaceMs: await getSetting(ctx, "defaultPaceMs"),
    paceMinMs: await getSetting(ctx, "paceMinMs"),
    paceMaxMs: await getSetting(ctx, "paceMaxMs"),
    paceMinCountedMs: await getSetting(ctx, "paceMinCountedMs"),
    paceSampleSize: await getSetting(ctx, "paceSampleSize"),
    paceMinFinishes: await getSetting(ctx, "paceMinFinishes"),
  };
}

/**
 * The person's pace across all their khatmas. Reads their finished rows newest
 * first and stops after 50 rows, or once enough counted finishes are in hand.
 * Pass `settings` when computing many paces so they are read once.
 */
export async function personPace(
  ctx: QueryCtx,
  personId: Id<"people">,
  settings?: PaceSettings,
): Promise<Pace> {
  const s = settings ?? (await paceSettings(ctx));
  const durations: number[] = [];
  let counted = 0;
  let scanned = 0;
  const rows = ctx.db
    .query("assignments")
    .withIndex("by_person_finishedAt", (q) => q.eq("personId", personId))
    .order("desc");
  for await (const a of rows) {
    // nulls sort first, so newest-first reaches the unfinished rows last
    if (a.finishedAt === null) break;
    const duration = a.finishedAt - a.takenAt;
    durations.push(duration);
    if (duration >= s.paceMinCountedMs) counted++;
    scanned++;
    if (counted >= s.paceSampleSize || scanned >= PACE_SCAN_ROWS) break;
  }
  return paceFrom(durations, s);
}

/** A pace in whole days, never under one. */
export function paceDays(paceMs: number): number {
  return Math.max(1, Math.round(paceMs / DAY_MS));
}

/**
 * Consecutive Saturday-to-Friday weeks (in `tz`) with at least one finish,
 * ending this week or last week. Zero when neither has one.
 */
export function weekStreak(
  finishedAts: readonly number[],
  tz: string,
  now: number,
): number {
  // 1970-01-03, day 2, was a Saturday, so weeks turn over at days 2, 9, 16...
  const weekOf = (at: number) => Math.floor((localDayNumber(at, tz) + 5) / 7);
  const weeks = new Set(finishedAts.map(weekOf));
  const thisWeek = weekOf(now);
  let week = weeks.has(thisWeek) ? thisWeek : thisWeek - 1;
  let streak = 0;
  while (weeks.has(week)) {
    streak++;
    week--;
  }
  return streak;
}
