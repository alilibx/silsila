import { expect, test } from "vitest";
import {
  cycleOf,
  isReadingDate,
  juzFor,
  khatmaNumber,
  messageTimesError,
  nextReadingDates,
  slotFor,
  type ReadingDays,
} from "./rota";

test("khatma number and cycle wrap at 30", () => {
  expect([1, 30, 31, 60, 61].map(khatmaNumber)).toEqual([1, 30, 1, 30, 1]);
  expect([1, 30, 31, 61].map(cycleOf)).toEqual([1, 1, 2, 3]);
});

test("each slot moves up one juz' per khatma and 30 wraps to 1", () => {
  expect(juzFor(7, 1)).toBe(7);
  expect(juzFor(7, 2)).toBe(8);
  expect(juzFor(30, 2)).toBe(1);
  expect(juzFor(7, 30)).toBe(6);
  for (let juz = 1; juz <= 30; juz++)
    for (const n of [1, 12, 30]) expect(juzFor(slotFor(juz, n), n)).toBe(juz);
});

test("daily, weekly (every week and every two weeks) and monthly reading dates", () => {
  const daily: ReadingDays = { kind: "daily" };
  expect(isReadingDate(daily, "2026-10-30", "2026-10-29")).toBe(false);
  expect(
    nextReadingDates(daily, "2026-10-30", "2026-10-30", 3, new Set()),
  ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  const fridays: ReadingDays = {
    kind: "weekly",
    weekdays: [5],
    everyWeeks: 1,
  };
  expect(
    nextReadingDates(fridays, "2026-10-30", "2026-10-30", 3, new Set()),
  ).toEqual(["2026-10-30", "2026-11-06", "2026-11-13"]);
  const otherFriday: ReadingDays = {
    kind: "weekly",
    weekdays: [5],
    everyWeeks: 2,
  };
  expect(
    nextReadingDates(otherFriday, "2026-10-30", "2026-10-30", 3, new Set()),
  ).toEqual(["2026-10-30", "2026-11-13", "2026-11-27"]);
  const monThu: ReadingDays = {
    kind: "weekly",
    weekdays: [1, 4],
    everyWeeks: 2,
  }; // first date a Thursday
  expect(
    nextReadingDates(monThu, "2026-10-29", "2026-10-29", 4, new Set()),
  ).toEqual(["2026-10-29", "2026-11-02", "2026-11-12", "2026-11-16"]);
  const monthly: ReadingDays = { kind: "monthly", days: [1, 31] };
  expect(
    nextReadingDates(monthly, "2026-10-31", "2026-10-31", 3, new Set()),
  ).toEqual(["2026-10-31", "2026-11-01", "2026-12-01"]);
});

test("paused dates are skipped", () => {
  expect(
    nextReadingDates(
      { kind: "daily" },
      "2026-10-30",
      "2026-10-30",
      2,
      new Set(["2026-10-31"]),
    ),
  ).toEqual(["2026-10-30", "2026-11-01"]);
});

test("message times: steps, quiet hours and order", () => {
  const ok = {
    dayAt: 480,
    reminder: { at: 960, on: true },
    unread: { at: 1140, on: true },
    summary: { at: 1260, on: false },
  };
  expect(messageTimesError(ok, 22, 7)).toBeNull();
  expect(messageTimesError({ ...ok, dayAt: 485 }, 22, 7)).toBe("step");
  expect(messageTimesError({ ...ok, dayAt: 360 }, 22, 7)).toBe("quiet");
  expect(
    messageTimesError({ ...ok, summary: { at: 1320, on: true } }, 22, 7),
  ).toBe("quiet");
  expect(
    messageTimesError({ ...ok, reminder: { at: 1200, on: true } }, 22, 7),
  ).toBe("order");
  expect(
    messageTimesError({ ...ok, reminder: { at: 1200, on: false } }, 22, 7),
  ).toBeNull();
});

test("every-two-weeks counts weeks from the first date, not from a fixed weekday", () => {
  const days: ReadingDays = {
    kind: "weekly",
    weekdays: [0, 6],
    everyWeeks: 2,
  }; // first date a Thursday
  expect(
    nextReadingDates(days, "2026-10-29", "2026-10-29", 3, new Set()),
  ).toEqual(["2026-10-31", "2026-11-01", "2026-11-14"]);
});
