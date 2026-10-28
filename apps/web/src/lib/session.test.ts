import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionToken,
  getClientKey,
  getSessionToken,
  setSessionToken,
  subscribeSession,
  useSessionToken,
} from "./session";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearSessionToken();
});

describe("session token storage", () => {
  it("is null until set, then round-trips", () => {
    expect(getSessionToken()).toBeNull();
    setSessionToken("x");
    expect(getSessionToken()).toBe("x");
    expect(localStorage.getItem("silsila.session")).toBe("x");
  });

  it("clears the token", () => {
    setSessionToken("x");
    clearSessionToken();
    expect(getSessionToken()).toBeNull();
  });

  it("notifies subscribers about same-tab set and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    setSessionToken("a");
    clearSessionToken();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setSessionToken("b");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribers about storage events from other tabs", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "silsila.session" }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("useSessionToken", () => {
  it("is undefined when signed out and follows same-tab changes", () => {
    const { result } = renderHook(() => useSessionToken());
    expect(result.current).toBeUndefined();
    act(() => setSessionToken("tok"));
    expect(result.current).toBe("tok");
    act(() => clearSessionToken());
    expect(result.current).toBeUndefined();
  });

  it("follows storage events from another tab", () => {
    const { result } = renderHook(() => useSessionToken());
    act(() => {
      localStorage.setItem("silsila.session", "other-tab");
      window.dispatchEvent(
        new StorageEvent("storage", { key: "silsila.session" }),
      );
    });
    expect(result.current).toBe("other-tab");
  });
});

describe("getClientKey", () => {
  it("is stable once created and persisted under silsila.client", () => {
    const key = getClientKey();
    expect(getClientKey()).toBe(key);
    expect(localStorage.getItem("silsila.client")).toBe(key);
  });

  it("has at least 128 bits of hex entropy and differs per browser", () => {
    const key = getClientKey();
    expect(key).toMatch(/^[0-9a-f]{32,}$/);
    localStorage.clear();
    expect(getClientKey()).not.toBe(key);
  });
});

describe.each([
  ["setItem throws", ["setItem"]],
  ["setItem and getItem throw", ["setItem", "getItem"]],
] as const)("storage failures (%s)", (_name, failing) => {
  beforeEach(() => {
    for (const method of failing) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new Error("storage unavailable");
      });
    }
  });

  it("still round-trips and clears the session token", () => {
    setSessionToken("tok");
    expect(getSessionToken()).toBe("tok");
    clearSessionToken();
    expect(getSessionToken()).toBeNull();
  });

  it("keeps the client key stable", () => {
    const key = getClientKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(getClientKey()).toBe(key);
  });
});
