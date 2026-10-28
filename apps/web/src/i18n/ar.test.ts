import { SCHEDULES } from "@convex/lib/schedule";
import { describe, expect, it } from "vitest";
import { t } from "./ar";

describe("schedule labels", () => {
  it("are exactly the six agreed labels, in order", () => {
    expect(SCHEDULES.map((s) => t.schedules[s])).toEqual([
      "يومية",
      "كل ٣ أيام",
      "أسبوعية",
      "كل أسبوعين",
      "شهرية",
      "بدون موعد",
    ]);
  });
});

describe("separators next to numbers", () => {
  // "·" beside Eastern Arabic digits reads as the digit zero (٠).
  it("never put a middle dot beside a number", () => {
    expect(t.home.yours("١٤", "ربما")).toBe("جزؤك: الجزء ١٤ «ربما»");
    expect(t.celebration.subtitle("ختمة العائلة", "١٢")).toBe(
      "الحمد لله، ختمة العائلة، الختمة ١٢",
    );
  });
});
