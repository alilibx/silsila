import { describe, expect, it } from "vitest";
import { periodMs, SCHEDULES, targetEndFor } from "./schedule";

const DAY = 86_400_000;

describe("schedule", () => {
  it("maps each schedule to its period", () => {
    expect(periodMs("daily")).toBe(DAY);
    expect(periodMs("every3days")).toBe(3 * DAY);
    expect(periodMs("weekly")).toBe(7 * DAY);
    expect(periodMs("biweekly")).toBe(14 * DAY);
    expect(periodMs("monthly")).toBe(30 * DAY);
    expect(periodMs("none")).toBeNull();
  });

  it("computes target ends", () => {
    expect(targetEndFor("none", 1000)).toBeNull();
    expect(targetEndFor("daily", 1000)).toBe(1000 + DAY);
    expect(targetEndFor("monthly", 0)).toBe(30 * DAY);
  });

  it("never offers yearly", () => {
    expect(SCHEDULES).not.toContain("yearly");
    expect([...SCHEDULES]).toEqual([
      "daily",
      "every3days",
      "weekly",
      "biweekly",
      "monthly",
      "none",
    ]);
  });
});
