import { v, type VLiteral } from "convex/values";

export const SCHEDULES = [
  "daily",
  "every3days",
  "weekly",
  "biweekly",
  "monthly",
  "none",
] as const;

export type Schedule = (typeof SCHEDULES)[number];

type ScheduleLiterals = [
  VLiteral<Schedule>,
  VLiteral<Schedule>,
  ...VLiteral<Schedule>[],
];

/** Validator for a schedule, derived from `SCHEDULES` so the two can never drift. */
export const scheduleValidator = v.union(
  ...(SCHEDULES.map((s) => v.literal(s)) as ScheduleLiterals),
);

const DAY_MS = 86_400_000;

const PERIOD_DAYS: Record<Exclude<Schedule, "none">, number> = {
  daily: 1,
  every3days: 3,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Length of one round in milliseconds, or `null` when the schedule has no target end. */
export function periodMs(s: Schedule): number | null {
  return s === "none" ? null : PERIOD_DAYS[s] * DAY_MS;
}

/** Target end timestamp for a round that started at `startedAt`, or `null` for `none`. */
export function targetEndFor(s: Schedule, startedAt: number): number | null {
  const period = periodMs(s);
  return period === null ? null : startedAt + period;
}
