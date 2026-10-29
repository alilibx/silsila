import { expect, test } from "vitest";
import {
  findJoinCode,
  JOIN_CODE_LENGTH,
  joinLink,
  joinText,
  randomJoinCode,
} from "./rotaJoin";

test("a join code is six symbols of the alphabet", () => {
  for (let i = 0; i < 50; i++) {
    expect(randomJoinCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  }
  expect(JOIN_CODE_LENGTH).toBe(6);
});

test("joinText puts the title, then the code", () => {
  expect(joinText("ختمة العائلة", "K7Q2MX")).toBe(
    "انضمام إلى ختمة العائلة · K7Q2MX",
  );
});

test("findJoinCode reads the code from a join message", () => {
  expect(findJoinCode("انضمام إلى ختمة العائلة · K7Q2MX")).toBe("K7Q2MX");
  expect(findJoinCode(joinText("ختمة", "AB23CD"))).toBe("AB23CD");
  // lowercase, Arabic digits
  expect(findJoinCode("انضمام k7q٢mx")).toBe("K7Q2MX");
  expect(findJoinCode("انضمام إلى ختمة · ab٢٣cd")).toBe("AB23CD");
  // a Latin title that looks like a code doesn't win over the code itself
  expect(findJoinCode(joinText("KHATMA", "K7Q2MX"))).toBe("K7Q2MX");
});

test("findJoinCode is null for other messages", () => {
  // a sign-in message
  expect(findJoinCode("رمز التحقق في وِردك: K7Q2-9XMB-4T")).toBeNull();
  // no «انضمام»
  expect(findJoinCode("ختمة العائلة · K7Q2MX")).toBeNull();
  // no code
  expect(findJoinCode("انضمام إلى ختمة العائلة")).toBeNull();
  // a token of the wrong length or with symbols outside the alphabet
  expect(findJoinCode("انضمام K7Q2M")).toBeNull();
  expect(findJoinCode("انضمام K7Q2MXY")).toBeNull();
  expect(findJoinCode("انضمام K7Q0MX")).toBeNull();
});

test("joinLink opens a chat with the join message typed", () => {
  const link = joinLink("+971 50 123 4567", "ختمة العائلة", "K7Q2MX");
  expect(link.startsWith("https://wa.me/971501234567?text=")).toBe(true);
  const text = new URL(link).searchParams.get("text");
  expect(text).toBe(joinText("ختمة العائلة", "K7Q2MX"));
  expect(link).toContain(encodeURIComponent("انضمام"));
});
