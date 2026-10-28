import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "../../lib/session";
import { useHandoffManifest } from "./useHandoffManifest";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

const STATIC_HREF = "/manifest.webmanifest";
const TTL_MS = 30 * 60_000;
/** Two thirds of the token's lifetime. */
const RENEW_MS = 20 * 60_000;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = navigator.userAgent;
const link = () =>
  document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
const blobs = new Map<string, Blob>();
let blobSeq = 0;

/** The `start_url` of the manifest the page points at now. */
async function startUrl(): Promise<string> {
  const blob = blobs.get(link().getAttribute("href")!);
  if (!blob) throw new Error(`not a hand-off manifest: ${link().href}`);
  return (JSON.parse(await blob.text()) as { start_url: string }).start_url;
}

function setStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, "standalone", {
    value,
    configurable: true,
  });
}

function setUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
}

/** Lets the token request, the manifest fetch, and the swap settle. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_CONVEX_URL", "https://x.convex.cloud");
  localStorage.clear();
  setSessionToken("sess");
  setStandalone(false);
  setUserAgent(IPHONE_UA);
  let n = 0;
  m.action
    .mockReset()
    .mockImplementation(async () => ({ token: `tok-${++n}`, ttlMs: TTL_MS }));
  document.head.innerHTML = `<link rel="manifest" href="${STATIC_HREF}">`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "وِردك", start_url: "/", scope: "/" }),
    }),
  );
  blobs.clear();
  blobSeq = 0;
  URL.createObjectURL = vi.fn((b: Blob) => {
    const url = `blob:test/${++blobSeq}`;
    blobs.set(url, b);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => void blobs.delete(url));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setStandalone(undefined);
  setUserAgent(DESKTOP_UA);
  document.head.innerHTML = "";
});

describe("useHandoffManifest", () => {
  it("keeps a token-carrying manifest in place in a signed-in iPhone Safari tab", async () => {
    const href = window.location.href;
    const length = window.history.length;
    renderHook(() => useHandoffManifest());
    await settle();

    expect(m.action.mock.calls[0]?.[1]).toEqual({ sessionToken: "sess" });
    expect(await startUrl()).toBe(`${window.location.origin}/?h=tok-1`);
    // only in the manifest: not the address, history, or page
    expect(window.location.href).toBe(href);
    expect(window.history.length).toBe(length);
    expect(document.body.innerHTML).not.toContain("tok-1");
  });

  it("works in other iOS browsers, which leave navigator.standalone unset", async () => {
    setUserAgent(CHROME_IOS_UA);
    setStandalone(undefined);
    renderHook(() => useHandoffManifest());
    await settle();
    expect(await startUrl()).toMatch(/h=tok-1$/);
  });

  it("does nothing off iOS, in the home-screen app, or when signed out", async () => {
    setUserAgent(DESKTOP_UA);
    let view = renderHook(() => useHandoffManifest());
    await settle();
    view.unmount();
    setUserAgent(IPHONE_UA);
    setStandalone(true);
    view = renderHook(() => useHandoffManifest());
    await settle();
    view.unmount();
    setStandalone(false);
    clearSessionToken();
    renderHook(() => useHandoffManifest());
    await settle();
    expect(m.action).not.toHaveBeenCalled();
    expect(link().getAttribute("href")).toBe(STATIC_HREF);
  });

  it("renews the token before it expires, and on return to a stale tab", async () => {
    renderHook(() => useHandoffManifest());
    await settle();
    expect(await startUrl()).toMatch(/h=tok-1$/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENEW_MS);
    });
    expect(m.action).toHaveBeenCalledTimes(2);
    expect(await startUrl()).toMatch(/h=tok-2$/);
    // the old manifest is let go
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");

    // a tab coming back to the front after a long sleep renews at once
    vi.setSystemTime(Date.now() + RENEW_MS);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(await startUrl()).toMatch(/h=tok-3$/);

    // and not again while the token is fresh
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(m.action).toHaveBeenCalledTimes(3);
  });

  it("retries a failed token request on the next check", async () => {
    m.action
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ token: "later", ttlMs: TTL_MS });
    renderHook(() => useHandoffManifest());
    await settle();
    expect(link().getAttribute("href")).toBe(STATIC_HREF);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(await startUrl()).toMatch(/h=later$/);
  });

  it("follows the token lifetime the server reports", async () => {
    m.action.mockResolvedValueOnce({ token: "short", ttlMs: 6 * 60_000 });
    renderHook(() => useHandoffManifest());
    await settle();
    expect(await startUrl()).toMatch(/h=short$/);
    // renewed at two thirds of six minutes, long before the default 20
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(await startUrl()).toMatch(/h=tok-1$/);
  });

  it("puts the static manifest back on sign-out, even before a token arrived", async () => {
    const { rerender } = renderHook(() => useHandoffManifest());
    await settle();
    act(() => clearSessionToken());
    rerender();
    expect(link().getAttribute("href")).toBe(STATIC_HREF);

    let release: (v: unknown) => void = () => {};
    m.action.mockReturnValueOnce(new Promise((r) => (release = r)));
    act(() => setSessionToken("sess-2"));
    await settle();
    act(() => clearSessionToken());
    await act(async () => release({ token: "late" }));
    await settle();
    expect(link().getAttribute("href")).toBe(STATIC_HREF);
  });
});
