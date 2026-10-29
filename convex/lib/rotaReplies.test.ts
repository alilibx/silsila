import { expect, test } from "vitest";
import { classifyReply } from "./rotaReplies";

test("done phrases", () => {
  for (const t of [
    "تم",
    "تمت",
    "أتممت",
    "اتممت",
    "خلصت",
    "قرأت",
    "قرأته",
    "الحمد لله تم",
    "done",
    "✅",
    "👍",
  ]) {
    expect(classifyReply(t), t).toBe("done");
  }
});

test("not-yet phrases", () => {
  for (const t of [
    "ليس بعد",
    "بعد",
    "لا بعد",
    "بعدين",
    "لاحقا",
    "مو بعد",
    "not yet",
  ]) {
    expect(classifyReply(t), t).toBe("notYet");
  }
});

test("stop phrases", () => {
  for (const t of ["إيقاف", "ايقاف", "أوقف", "stop"]) {
    expect(classifyReply(t), t).toBe("stop");
  }
});

test("dua phrases", () => {
  for (const t of ["دعاء الختم", "الدعاء"]) {
    expect(classifyReply(t), t).toBe("dua");
  }
});

test("diacritics, tatweel, alef forms, ta marbuta, case and spacing don't matter", () => {
  expect(classifyReply("تَمَّ")).toBe("done");
  expect(classifyReply("تمـــت")).toBe("done");
  expect(classifyReply("قرأتة")).toBe("done");
  expect(classifyReply("اتممت")).toBe("done");
  expect(classifyReply("قَرَأْتُ")).toBe("done");
  expect(classifyReply("لَاحِقًا")).toBe("notYet");
  expect(classifyReply("إِيقَاف")).toBe("stop");
  expect(classifyReply("ايقاف")).toBe("stop");
  expect(classifyReply("  DONE! ")).toBe("done");
  expect(classifyReply("Not  Yet")).toBe("notYet");
  expect(classifyReply("STOP")).toBe("stop");
  expect(classifyReply("👍🏽")).toBe("done");
  expect(classifyReply("✅️")).toBe("done");
});

test("done and stop count as the first word of a longer text", () => {
  expect(classifyReply("تم والحمد لله")).toBe("done");
  expect(classifyReply("done thanks")).toBe("done");
  expect(classifyReply("stop please")).toBe("stop");
  expect(classifyReply("إيقاف الرسائل")).toBe("stop");
});

test("not-yet and dua need the whole text", () => {
  expect(classifyReply("بعد الظهر")).toBeNull();
  expect(classifyReply("دعاء الختم من فضلك")).toBeNull();
});

test("anything else is null", () => {
  expect(classifyReply("السلام عليكم")).toBeNull();
  expect(classifyReply("")).toBeNull();
  expect(classifyReply("   ")).toBeNull();
  expect(classifyReply("hello")).toBeNull();
});
