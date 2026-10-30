import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyStoredTheme, useTheme } from "./theme";

function mockSystem(scheme: "dark" | "light") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && scheme === "dark",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("follows the system when nothing is stored", () => {
    mockSystem("dark");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("a stored choice beats the system", () => {
    mockSystem("dark");
    localStorage.setItem("wirdak.admin.theme", "light");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle flips the page and stores the choice", () => {
    mockSystem("light");
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("wirdak.admin.theme")).toBe("dark");
  });

  it("still applies the system theme when storage throws", () => {
    mockSystem("dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => applyStoredTheme()).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
