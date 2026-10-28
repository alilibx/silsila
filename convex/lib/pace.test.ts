import { describe, expect, test } from "vitest";
import { paceDays, paceFrom, weekStreak } from "./pace";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const s = {
  defaultPaceMs: 3 * DAY,
  paceMinMs: DAY,
  paceMaxMs: 7 * DAY,
  paceMinCountedMs: 20 * MIN,
  paceSampleSize: 5,
  paceMinFinishes: 3,
};

describe("paceFrom", () => {
  test("paceFrom", () => {
    expect(paceFrom([], s)).toEqual({ paceMs: 3 * DAY, known: false });
    expect(paceFrom([2 * DAY, 10 * MIN, 2 * DAY, 4 * DAY], s)).toEqual({
      paceMs: 2 * DAY,
      known: true,
    });
    expect(paceFrom([HOUR, HOUR, HOUR], s).paceMs).toBe(DAY);
    expect(paceFrom([9 * DAY, 9 * DAY, 9 * DAY], s).paceMs).toBe(7 * DAY);
  });

  test("an even count uses the mean of the middle two", () => {
    const pace = paceFrom([DAY, 2 * DAY, 3 * DAY, 4 * DAY], s);
    expect(pace).toEqual({ paceMs: 2.5 * DAY, known: true });
  });

  test("only the newest five counted finishes are used", () => {
    const newest = [2 * DAY, 2 * DAY, 2 * DAY, 2 * DAY, 2 * DAY];
    expect(
      paceFrom([...newest, 7 * DAY, 7 * DAY, 7 * DAY, 7 * DAY], s),
    ).toEqual({ paceMs: 2 * DAY, known: true });
  });

  test("under three counted finishes the default holds and nothing is known", () => {
    expect(paceFrom([DAY, 2 * DAY, 5 * MIN, 5 * MIN], s)).toEqual({
      paceMs: 3 * DAY,
      known: false,
    });
  });
});

test("paceDays rounds and is at least one", () => {
  expect(paceDays(DAY)).toBe(1);
  expect(paceDays(0.4 * DAY)).toBe(1);
  expect(paceDays(2.4 * DAY)).toBe(2);
  expect(paceDays(2.5 * DAY)).toBe(3);
});

describe("weekStreak", () => {
  // 2027-01-15 is a Friday: this week is Saturday 9 to Friday 15 January.
  const now = Date.parse("2027-01-15T12:00:00+04:00");
  const ago = (days: number) => now - days * DAY;

  test("counts consecutive weeks ending this week", () => {
    expect(weekStreak([ago(0), ago(7), ago(14)], "Asia/Dubai", now)).toBe(3);
  });

  test("a week without a finish yet does not break last week's streak", () => {
    expect(weekStreak([ago(7), ago(14)], "Asia/Dubai", now)).toBe(2);
  });

  test("a gap ends the streak", () => {
    expect(weekStreak([ago(0), ago(14), ago(21)], "Asia/Dubai", now)).toBe(1);
    expect(weekStreak([ago(14), ago(21)], "Asia/Dubai", now)).toBe(0);
    expect(weekStreak([], "Asia/Dubai", now)).toBe(0);
  });

  test("several finishes in one week count once", () => {
    expect(weekStreak([ago(0), ago(1), ago(2)], "Asia/Dubai", now)).toBe(1);
  });

  test("weeks turn over on Saturday in the person's time zone", () => {
    // Saturday 00:30 in Dubai is still Friday 20:30 in UTC
    const saturday = Date.parse("2027-01-16T00:30:00+04:00");
    const friday = Date.parse("2027-01-15T23:30:00+04:00");
    expect(weekStreak([saturday, friday], "Asia/Dubai", saturday)).toBe(2);
    expect(weekStreak([saturday, friday], "UTC", saturday)).toBe(1);
  });

  test("a time zone Intl rejects counts as Asia/Dubai", () => {
    expect(weekStreak([ago(0), ago(7)], "Not/AZone", now)).toBe(2);
  });
});
