import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "./session";
import { useTouch } from "./useTouch";

const m = vi.hoisted(() => ({ touch: vi.fn(), sync: vi.fn() }));
vi.mock("convex/react", () => ({ useMutation: () => m.touch }));
vi.mock("./push", () => ({ syncPush: (...a: unknown[]) => m.sync(...a) }));

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 28, 12);

const show = () => document.dispatchEvent(new Event("visibilitychange"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  m.touch.mockReset().mockResolvedValue({ ok: true });
  m.sync.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  clearSessionToken();
  vi.useRealTimers();
});

describe("useTouch", () => {
  it("does nothing while signed out", () => {
    renderHook(() => useTouch());
    expect(m.touch).not.toHaveBeenCalled();
    expect(m.sync).not.toHaveBeenCalled();
  });

  it("touches on load with the time zone and syncs push", () => {
    setSessionToken("tok");
    renderHook(() => useTouch());
    expect(m.touch).toHaveBeenCalledWith({
      sessionToken: "tok",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(m.sync).toHaveBeenCalledWith("tok");
  });

  it("touches at most once an hour, also when the page becomes visible", () => {
    setSessionToken("tok");
    renderHook(() => useTouch());
    show();
    vi.setSystemTime(NOW + HOUR - 1000);
    show();
    expect(m.touch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + HOUR + 1000);
    show();
    expect(m.touch).toHaveBeenCalledTimes(2);
  });

  it("does not wait an hour for a different person on the same browser", () => {
    setSessionToken("first-token-aaaa");
    const { unmount } = renderHook(() => useTouch());
    unmount();
    setSessionToken("second-token-bbbb");
    renderHook(() => useTouch());
    expect(m.touch).toHaveBeenCalledTimes(2);
  });
});
