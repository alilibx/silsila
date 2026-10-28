import { v } from "convex/values";
import type { Schedule } from "./schedule";
import { addWakingMs, wakingDayMs, type QuietHours } from "./wakingTime";

export type GraceUnit = "minutes" | "hours" | "days";
export type Grace = { value: number; unit: GraceUnit };

export const graceValidator = v.object({
  value: v.number(),
  unit: v.union(v.literal("minutes"), v.literal("hours"), v.literal("days")),
});

/** Grace a khatma gets by default, per schedule (spec 3.1). */
export const DEFAULT_GRACE: Record<Schedule, Grace> = {
  daily: { value: 6, unit: "hours" },
  every3days: { value: 1, unit: "days" },
  weekly: { value: 2, unit: "days" },
  biweekly: { value: 4, unit: "days" },
  monthly: { value: 7, unit: "days" },
  none: { value: 7, unit: "days" },
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MIN_GRACE_MS = 30 * MINUTE_MS;
const MAX_GRACE_MS = 30 * DAY_MS;

const UNIT_MS: Record<GraceUnit, number> = {
  minutes: MINUTE_MS,
  hours: HOUR_MS,
  days: DAY_MS,
};

/** A whole number of at least 1, between 30 minutes and 30 days as written. */
export function isValidGrace(g: Grace): boolean {
  if (!Number.isInteger(g.value) || g.value < 1) return false;
  const ms = g.value * UNIT_MS[g.unit];
  return ms >= MIN_GRACE_MS && ms <= MAX_GRACE_MS;
}

/** Waking milliseconds in a grace. A grace day is one waking day, not 24 hours. */
export function graceWakingMs(g: Grace, q: QuietHours): number {
  return g.unit === "days"
    ? g.value * wakingDayMs(q)
    : g.value * UNIT_MS[g.unit];
}

/**
 * When the "almost up" note fires and when the grace ends, for a juz' taken at
 * `takenAt`. `noticeFraction` is the share of the grace still left at the note.
 */
export function graceTimes(
  takenAt: number,
  wakingMs: number,
  tz: string,
  q: QuietHours,
  noticeFraction: number,
): { noticeAt: number; endsAt: number } {
  return {
    noticeAt: addWakingMs(takenAt, wakingMs * (1 - noticeFraction), tz, q),
    endsAt: addWakingMs(takenAt, wakingMs, tz, q),
  };
}
