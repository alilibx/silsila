import { describe, expect, it } from "vitest";
import { formatIsoDate, formatTime } from "./format";

describe("formatTime", () => {
  it("writes minutes after midnight on a 12-hour clock in Eastern Arabic digits", () => {
    expect(formatTime(480)).toBe("٨:٠٠ ص");
    expect(formatTime(1260)).toBe("٩:٠٠ م");
    expect(formatTime(960)).toBe("٤:٠٠ م");
    expect(formatTime(1140)).toBe("٧:٠٠ م");
  });

  it("reads midnight and noon as 12, and keeps the minutes", () => {
    expect(formatTime(0)).toBe("١٢:٠٠ ص");
    expect(formatTime(720)).toBe("١٢:٠٠ م");
    expect(formatTime(795)).toBe("١:١٥ م");
  });
});

describe("formatIsoDate", () => {
  it("writes the weekday, day and month of a YYYY-MM-DD date", () => {
    expect(formatIsoDate("2026-10-30")).toBe("الجمعة ٣٠ أكتوبر");
    expect(formatIsoDate("2027-01-01")).toBe("الجمعة ١ يناير");
  });

  it("does not move with the machine's time zone", () => {
    expect(formatIsoDate("2026-10-29")).toBe("الخميس ٢٩ أكتوبر");
  });
});
