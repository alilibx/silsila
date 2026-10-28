import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadProgress, saveProgress, type Progress } from "./progress";

const KEY = "wirdak.verify";
const base = () => ({
  verificationId: "v1",
  secret: "sec",
  displayName: "علي",
  expiresAt: Date.now() + 60_000,
});

beforeEach(() => {
  // A fixed clock: base() reads Date.now(), so two calls must agree.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-28T08:00:00Z"));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("progress intent", () => {
  it("round-trips each kind of intent", () => {
    const intents: NonNullable<Progress["intent"]>[] = [
      { kind: "take", inviteCode: "CODE", juz: 7 },
      { kind: "create", name: "ختمة الجمعة", schedule: "daily" },
      { kind: "signin" },
    ];
    for (const intent of intents) {
      saveProgress({ ...base(), intent });
      expect(loadProgress()?.intent).toEqual(intent);
    }
  });

  it("keeps the verification but drops a malformed intent", () => {
    for (const intent of [
      { kind: "take", inviteCode: "CODE", juz: 31 },
      { kind: "take", inviteCode: "", juz: 3 },
      { kind: "take", inviteCode: "CODE", juz: "3" },
      { kind: "create", name: "x", schedule: "yearly" },
      { kind: "create", name: 5, schedule: "weekly" },
      { kind: "delete-everything" },
      "signin",
    ]) {
      localStorage.setItem(KEY, JSON.stringify({ ...base(), intent }));
      const loaded = loadProgress();
      expect(loaded?.verificationId).toBe("v1");
      expect(loaded).not.toHaveProperty("intent");
    }
  });

  it("progress saved before intents existed still loads", () => {
    localStorage.setItem(KEY, JSON.stringify(base()));
    expect(loadProgress()).toEqual(base());
  });
});
