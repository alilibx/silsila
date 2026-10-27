import { describe, expect, it } from "vitest";
import {
  cleanDisplayName,
  maskPhone,
  normalizeDigits,
  toArabicDigits,
} from "./text";

describe("digits", () => {
  it("converts to Arabic-Indic digits", () => {
    expect(toArabicDigits(1430)).toBe("١٤٣٠");
    expect(toArabicDigits("12/30")).toBe("١٢/٣٠");
    expect(toArabicDigits(0)).toBe("٠");
  });

  it("normalizes Arabic-Indic and Persian digits to ASCII", () => {
    expect(normalizeDigits("٤٨٢١ ۴")).toBe("4821 4");
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹")).toBe(
      "01234567890123456789",
    );
    expect(normalizeDigits("abc 12")).toBe("abc 12");
  });
});

describe("cleanDisplayName", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(cleanDisplayName("   ")).toBeNull();
    expect(cleanDisplayName("")).toBeNull();
    expect(cleanDisplayName("\u0007\u0000\n")).toBeNull();
  });

  it("trims, collapses spaces, and strips control characters", () => {
    expect(cleanDisplayName("  أبو   علي \u0007")).toBe("أبو علي");
    expect(cleanDisplayName("a\tb\nc")).toBe("a b c");
    expect(cleanDisplayName("a\u0000b")).toBe("ab");
  });

  it("cuts to 40 characters", () => {
    expect(cleanDisplayName("ا".repeat(60))).toHaveLength(40);
  });

  it("does not leave a trailing space after cutting", () => {
    const name = cleanDisplayName("ا".repeat(39) + " " + "ب".repeat(10));
    expect(name).toBe("ا".repeat(39));
  });
});

describe("maskPhone", () => {
  it("masks UAE and Sudan numbers", () => {
    expect(maskPhone("+971501234567")).toBe("+971 50 ••• 4567");
    expect(maskPhone("+249912345678")).toBe("+249 91 ••• 5678");
  });

  it("handles single-digit country codes", () => {
    expect(maskPhone("+14155552671")).toBe("+1 41 ••• 2671");
  });

  it("falls back to a fully masked form for unparseable input", () => {
    expect(maskPhone("garbage")).not.toMatch(/garbage/);
  });
});
