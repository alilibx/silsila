import { describe, expect, it } from "vitest";
import { JUZ } from "./juz";

describe("JUZ", () => {
  it("has 30 entries numbered 1..30", () => {
    expect(JUZ).toHaveLength(30);
    JUZ.forEach((j, i) => expect(j.number).toBe(i + 1));
  });

  it("has the expected first, middle, and last entries", () => {
    expect(JUZ[0]).toEqual({
      number: 1,
      name: "الم",
      startSurah: "الفاتحة",
      startAyah: "1:1",
    });
    expect(JUZ[13]).toMatchObject({
      number: 14,
      name: "ربما",
      startSurah: "الحجر",
      startAyah: "15:1",
    });
    expect(JUZ[29]).toMatchObject({
      number: 30,
      name: "عمّ",
      startSurah: "النبأ",
      startAyah: "78:1",
    });
  });

  it("has well-formed, strictly increasing start ayahs", () => {
    let prev: [number, number] = [0, 0];
    for (const j of JUZ) {
      expect(j.startAyah).toMatch(/^\d{1,3}:\d{1,3}$/);
      const [s, a] = j.startAyah.split(":").map(Number) as [number, number];
      expect(s > prev[0] || (s === prev[0] && a > prev[1])).toBe(true);
      prev = [s, a];
    }
  });
});
