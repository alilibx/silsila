import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSessionToken, setSessionToken } from "../../lib/session";
import { useHandoffManifest } from "./useHandoffManifest";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

const TTL_MS = 30 * 60_000;
/** Two thirds of the token's lifetime. */
const RENEW_MS = 20 * 60_000;
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = navigator.userAgent;
const hrefs = () =>
  [...document.querySelectorAll('link[rel="manifest"]')].map((l) =>
    l.getAttribute("href"),
  );
const DATA_PREFIX = "data:application/manifest+json;charset=utf-8,";

/** The `start_url` of the one manifest the page links. */
async function startUrl(): Promise<string> {
  const [href] = hrefs();
  expect(hrefs()).toHaveLength(1);
  if (!href?.startsWith(DATA_PREFIX)) {
    throw new Error(`not a hand-off manifest: ${href}`);
  }
  const manifest = JSON.parse(
    decodeURIComponent(href.slice(DATA_PREFIX.length)),
  );
  return (manifest as { start_url: string }).start_url;
}

const creates = () => m.action.mock.calls.filter(([, a]) => !("token" in a));
const extends_ = () => m.action.mock.calls.filter(([, a]) => "token" in a);

function setStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, "standalone", {
    value,
    configurable: true,
  });
}

function setUserAgent(value: string) {
  Object.defineProperty(navigator, "userAgent", { value, configurable: true });
}

/** Lets the token request, the manifest fetch, and the link settle. */
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
    .mockImplementation(async (_fn: unknown, args: object) =>
      "token" in args
        ? { ttlMs: TTL_MS }
        : { token: `tok-${++n}`, ttlMs: TTL_MS },
    );
  // index.html links no manifest, and linkPageManifest adds none in an iPhone tab
  document.head.innerHTML = "";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "وِردك", start_url: "/", scope: "/" }),
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setStandalone(undefined);
  setUserAgent(DESKTOP_UA);
  document.head.innerHTML = "";
});

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("useHandoffManifest", () => {
  it("links one token-carrying manifest in a signed-in iPhone Safari tab", async () => {
    const href = window.location.href;
    const length = window.history.length;
    renderHook(() => useHandoffManifest());
    await settle();

    expect(creates()[0]?.[1]).toEqual({ sessionToken: "sess" });
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

  it("makes one token under StrictMode's double effects", async () => {
    renderHook(() => useHandoffManifest(), { wrapper: StrictMode });
    await settle();
    expect(creates()).toHaveLength(1);
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
    expect(hrefs()).toEqual([]);
  });

  it("extends the same token before it expires and on return to a stale tab, never relinking", async () => {
    renderHook(() => useHandoffManifest());
    await settle();
    expect(await startUrl()).toMatch(/h=tok-1$/);

    await advance(RENEW_MS);
    expect(creates()).toHaveLength(1);
    expect(extends_().map(([, a]) => a)).toEqual([
      { sessionToken: "sess", token: "tok-1" },
    ]);

    // a tab coming back to the front after a long sleep extends at once
    vi.setSystemTime(Date.now() + RENEW_MS);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(extends_()).toHaveLength(2);

    // and not again while the token is fresh
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(extends_()).toHaveLength(2);
    // the first manifest is the one iOS keeps, so it is never replaced
    expect(await startUrl()).toMatch(/h=tok-1$/);
    expect(hrefs()).toHaveLength(1);
  });

  it("retries a failed token request on the next check", async () => {
    m.action
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ token: "later", ttlMs: TTL_MS });
    renderHook(() => useHandoffManifest());
    await settle();
    expect(hrefs()).toEqual([]);
    await advance(60_000);
    expect(await startUrl()).toMatch(/h=later$/);
  });

  it("follows the token lifetime the server reports", async () => {
    m.action.mockResolvedValueOnce({ token: "short", ttlMs: 6 * 60_000 });
    renderHook(() => useHandoffManifest());
    await settle();
    // extended at two thirds of six minutes, long before the default 20
    await advance(4 * 60_000);
    expect(extends_().map(([, a]) => a)).toEqual([
      { sessionToken: "sess", token: "short" },
    ]);
  });

  it("stops extending once the server refuses the token (the home-screen app used it)", async () => {
    renderHook(() => useHandoffManifest());
    await settle();
    m.action.mockResolvedValue({ error: "invalid" });
    await advance(RENEW_MS);
    expect(extends_()).toHaveLength(1);
    await advance(RENEW_MS * 3);
    expect(extends_()).toHaveLength(1);
    expect(creates()).toHaveLength(1);
  });

  it("links nothing when another manifest came first, since iOS keeps that one", async () => {
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest">';
    renderHook(() => useHandoffManifest());
    await settle();
    expect(m.action).not.toHaveBeenCalled();
    expect(hrefs()).toEqual(["/manifest.webmanifest"]);
  });

  it("links no token made just before sign-out, and links one after signing back in", async () => {
    let release: (v: unknown) => void = () => {};
    m.action.mockReturnValueOnce(new Promise((r) => (release = r)));
    const { rerender } = renderHook(() => useHandoffManifest());
    await settle();
    act(() => clearSessionToken());
    rerender();
    await act(async () => release({ token: "late", ttlMs: TTL_MS }));
    await settle();
    expect(hrefs()).toEqual([]);

    act(() => setSessionToken("sess-2"));
    await settle();
    expect(await startUrl()).toMatch(/h=tok-1$/);
  });

  it("makes no second manifest for a later session on the same page", async () => {
    renderHook(() => useHandoffManifest());
    await settle();
    act(() => clearSessionToken());
    act(() => setSessionToken("sess-2"));
    await settle();
    await advance(RENEW_MS);
    expect(creates()).toHaveLength(1);
    expect(extends_()).toHaveLength(0);
    expect(await startUrl()).toMatch(/h=tok-1$/);
  });

  it("links a new session's token at once when it signs in while the last one's is pending", async () => {
    let release: (v: unknown) => void = () => {};
    m.action.mockReturnValueOnce(new Promise((r) => (release = r)));
    renderHook(() => useHandoffManifest());
    await settle();
    act(() => clearSessionToken());
    act(() => setSessionToken("sess-2"));
    await settle();
    await act(async () => release({ token: "late", ttlMs: TTL_MS }));
    await settle();
    // no waiting for the next minute's check
    expect(creates().map(([, a]) => a)).toEqual([
      { sessionToken: "sess" },
      { sessionToken: "sess-2" },
    ]);
    expect(await startUrl()).toMatch(/h=tok-1$/);
  });
});
