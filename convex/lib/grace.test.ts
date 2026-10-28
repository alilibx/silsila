import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRACE,
  graceTimes,
  graceWakingMs,
  isValidGrace,
} from "./grace";
import { SCHEDULES } from "./schedule";
import { addWakingMs } from "./wakingTime";

const Q = { startHour: 22, endHour: 7 };
const H = 3_600_000;
const dubai = (iso: string) => Date.parse(`${iso}+04:00`);

describe("grace", () => {
  it("6 hours from 21:30 Dubai ends 12:30 next day; notice at 11:00", () => {
    const t = graceTimes(
      dubai("2026-11-02T21:30:00"),
      6 * H,
      "Asia/Dubai",
      Q,
      0.25,
    );
    expect(t.endsAt).toBe(dubai("2026-11-03T12:30:00"));
    expect(t.noticeAt).toBe(dubai("2026-11-03T11:00:00"));
  });

  it("2 days from Monday 10:00 ends Wednesday 10:00", () => {
    const ms = graceWakingMs({ value: 2, unit: "days" }, Q);
    expect(addWakingMs(dubai("2026-11-02T10:00:00"), ms, "Asia/Dubai", Q)).toBe(
      dubai("2026-11-04T10:00:00"),
    );
  });

  it("converts minutes, hours and days to waking milliseconds", () => {
    expect(graceWakingMs({ value: 30, unit: "minutes" }, Q)).toBe(30 * 60_000);
    expect(graceWakingMs({ value: 6, unit: "hours" }, Q)).toBe(6 * H);
    expect(graceWakingMs({ value: 1, unit: "days" }, Q)).toBe(15 * H);
  });

  it("grace validation and defaults", () => {
    expect(DEFAULT_GRACE.daily).toEqual({ value: 6, unit: "hours" });
    expect(DEFAULT_GRACE.every3days).toEqual({ value: 1, unit: "days" });
    expect(DEFAULT_GRACE.weekly).toEqual({ value: 2, unit: "days" });
    expect(DEFAULT_GRACE.biweekly).toEqual({ value: 4, unit: "days" });
    expect(DEFAULT_GRACE.monthly).toEqual({ value: 7, unit: "days" });
    expect(DEFAULT_GRACE.none).toEqual({ value: 7, unit: "days" });
    for (const s of SCHEDULES)
      expect(isValidGrace(DEFAULT_GRACE[s])).toBe(true);
    expect(isValidGrace({ value: 29, unit: "minutes" })).toBe(false);
    expect(isValidGrace({ value: 30, unit: "minutes" })).toBe(true);
    expect(isValidGrace({ value: 31, unit: "days" })).toBe(false);
    expect(isValidGrace({ value: 30, unit: "days" })).toBe(true);
    expect(isValidGrace({ value: 720, unit: "hours" })).toBe(true);
    expect(isValidGrace({ value: 721, unit: "hours" })).toBe(false);
    expect(isValidGrace({ value: 43200, unit: "minutes" })).toBe(true);
    expect(isValidGrace({ value: 43201, unit: "minutes" })).toBe(false);
    expect(isValidGrace({ value: 1.5, unit: "hours" })).toBe(false);
    expect(isValidGrace({ value: 0, unit: "hours" })).toBe(false);
    expect(isValidGrace({ value: Number.NaN, unit: "hours" })).toBe(false);
  });
});
