import { afterEach, describe, expect, it, vi } from "vitest";
import { isOlder, lastingStorage, versionGate } from "./versionGate";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => (map.set(k, v), true),
  };
}

describe("isOlder", () => {
  it("compares each part as a number", () => {
    expect(isOlder("0.2.1", "0.10.0")).toBe(true);
    expect(isOlder("0.10.0", "0.2.1")).toBe(false);
    expect(isOlder("1.0.0", "1.0.0")).toBe(false);
    expect(isOlder("1.2.3", "1.2.4")).toBe(true);
    expect(isOlder("2.0.0", "1.9.9")).toBe(false);
  });
});

describe("versionGate", () => {
  it("is ok without a required version, or when this one is new enough", () => {
    const s = memoryStorage();
    expect(versionGate("0.2.1", null, s)).toBe("ok");
    expect(versionGate("0.3.0", "0.3.0", s)).toBe("ok");
    expect(versionGate("0.4.0", "0.3.0", s)).toBe("ok");
  });

  it("reloads once for a required version, then gets stuck instead of looping", () => {
    const s = memoryStorage();
    expect(versionGate("0.2.1", "0.3.0", s)).toBe("reload");
    expect(versionGate("0.2.1", "0.3.0", s)).toBe("stuck");
    expect(versionGate("0.2.1", "0.3.0", s)).toBe("stuck");
  });

  it("reloads again for a newer required version", () => {
    const s = memoryStorage();
    versionGate("0.2.1", "0.3.0", s);
    expect(versionGate("0.2.1", "0.3.0", s)).toBe("stuck");
    expect(versionGate("0.2.1", "0.4.0", s)).toBe("reload");
  });
});

describe("versionGate without lasting storage", () => {
  it("stops at the button instead of reloading when the marker can't be kept", () => {
    const forgetful = { get: () => null, set: () => false };
    expect(versionGate("0.2.1", "0.3.0", forgetful)).toBe("stuck");
    expect(versionGate("0.2.1", "0.3.0", forgetful)).toBe("stuck");
  });
});

describe("lastingStorage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("falls back to sessionStorage when localStorage refuses", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(lastingStorage.set("k", "v")).toBe(true);
    expect(lastingStorage.get("k")).toBe("v");
  });

  it("reports failure when neither storage keeps the value", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(lastingStorage.set("k", "v")).toBe(false);
    expect(versionGate("0.2.1", "0.3.0", lastingStorage)).toBe("stuck");
  });
});
