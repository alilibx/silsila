import { nextReadingDates, type ReadingDays } from "@convex/lib/rota";

/** The first reading day on or after `from`; `from` itself when none is found. */
export function firstReadingDay(days: ReadingDays, from: string): string {
  return nextReadingDates(days, from, from, 1, new Set())[0] ?? from;
}
