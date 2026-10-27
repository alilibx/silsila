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
