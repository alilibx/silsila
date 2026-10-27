import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  formatCode,
  hmacSha256Hex,
  normalizeCode,
  randomCode,
  randomPin,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "./crypto";

describe("codes", () => {
  it("has the 32-character alphabet", () => {
    expect(CODE_ALPHABET).toBe("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    expect(CODE_ALPHABET).toHaveLength(32);
  });

  it("generates codes from the alphabet", () => {
    expect(randomCode(10)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    expect(randomCode(0)).toBe("");
    for (let i = 0; i < 200; i++)
      expect(randomCode(10)).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it("uses every alphabet character eventually (no dead symbols)", () => {
    const seen = new Set(randomCode(2000));
    expect(seen.size).toBe(32);
  });

  it("formats XXXX-XXXX-XX", () => {
    expect(formatCode("K7Q29XMB4T")).toBe("K7Q2-9XMB-4T");
  });

  it("normalizes messy input", () => {
    expect(normalizeCode("رمز التحقق في سلسلة: k7q2 9xmb-4t ")).toBe(
      "K7Q29XMB4T",
    );
    expect(normalizeCode("I O 0 1 l")).toBe("L");
  });
});

describe("randomPin / randomToken", () => {
  it("returns 6 digits", () => {
    for (let i = 0; i < 50; i++) expect(randomPin()).toMatch(/^\d{6}$/);
  });

  it("returns unpadded base64url", () => {
    expect(randomToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(randomToken(1)).toMatch(/^[A-Za-z0-9_-]{2}$/);
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
});

describe("hashing", () => {
  it("computes SHA-256 hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("computes HMAC-SHA256 hex (RFC 4231 test case 2)", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });
});

describe("timingSafeEqual", () => {
  it("compares strings", () => {
    expect(timingSafeEqual("ab", "ab")).toBe(true);
    expect(timingSafeEqual("ab", "ac")).toBe(false);
    expect(timingSafeEqual("ab", "abc")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
