import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHandoffToken,
  extendHandoffToken,
  handoffManifest,
  linkHandoffManifest,
  linkPageManifest,
  redeemHandoffToken,
  STATIC_MANIFEST,
} from "./handoff";

const m = vi.hoisted(() => ({ action: vi.fn() }));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

const STATIC = {
  id: "/",
  name: "وِردك",
  start_url: "/",
  scope: "/",
  display: "standalone",
  icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
};

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://x.convex.cloud");
  m.action.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  document.head.innerHTML = "";
});

describe("handoffManifest", () => {
  it("copies the static manifest and puts the token only in start_url, with absolute urls", () => {
    const out = handoffManifest(STATIC, "tok", "https://wirdak.app");
    expect(out).toEqual({
      ...STATIC,
      id: "https://wirdak.app/",
      start_url: "https://wirdak.app/?h=tok",
      scope: "https://wirdak.app/",
      icons: [
        {
          src: "https://wirdak.app/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
      ],
    });
    expect(JSON.stringify(out).match(/tok/g)).toHaveLength(1);
  });
});

describe("handoffManifest id", () => {
  it("gives a manifest without an id the stable id /", () => {
    const noId: Partial<typeof STATIC> = { ...STATIC };
    delete noId.id;
    expect(handoffManifest(noId, "tok", "https://wirdak.app").id).toBe(
      "https://wirdak.app/",
    );
  });
});

describe("createHandoffToken / redeemHandoffToken", () => {
  it("returns the token, or null when the server says not signed in or fails", async () => {
    m.action.mockResolvedValueOnce({ token: "abc", ttlMs: 1_800_000 });
    expect(await createHandoffToken("sess")).toEqual({
      token: "abc",
      ttlMs: 1_800_000,
    });
    expect(m.action.mock.calls[0]?.[1]).toEqual({ sessionToken: "sess" });
    m.action.mockResolvedValueOnce({ error: "not_signed_in" });
    expect(await createHandoffToken("sess")).toBeNull();
    m.action.mockRejectedValueOnce(new Error("offline"));
    expect(await createHandoffToken("sess")).toBeNull();
  });

  it("redeems for a session token, or null on invalid or failure", async () => {
    m.action.mockResolvedValueOnce({ sessionToken: "new" });
    expect(await redeemHandoffToken("tok", "Asia/Dubai")).toBe("new");
    expect(m.action.mock.calls[0]?.[1]).toEqual({
      token: "tok",
      timeZone: "Asia/Dubai",
    });
    m.action.mockResolvedValueOnce({ error: "invalid" });
    expect(await redeemHandoffToken("tok", "Asia/Dubai")).toBeNull();
    m.action.mockRejectedValueOnce(new Error("offline"));
    expect(await redeemHandoffToken("tok", "Asia/Dubai")).toBeNull();
  });
});

describe("extendHandoffToken", () => {
  it("returns the lifetime, invalid when refused, or null when offline", async () => {
    m.action.mockResolvedValueOnce({ ttlMs: 1_800_000 });
    expect(await extendHandoffToken("sess", "tok")).toBe(1_800_000);
    expect(m.action.mock.calls[0]?.[1]).toEqual({
      sessionToken: "sess",
      token: "tok",
    });
    m.action.mockResolvedValueOnce({ error: "invalid" });
    expect(await extendHandoffToken("sess", "tok")).toBe("invalid");
    m.action.mockRejectedValueOnce(new Error("offline"));
    expect(await extendHandoffToken("sess", "tok")).toBeNull();
  });
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = navigator.userAgent;
const manifestHrefs = () =>
  [...document.querySelectorAll('link[rel="manifest"]')].map((l) =>
    l.getAttribute("href"),
  );

function setDevice(userAgent: string, standalone: boolean | undefined) {
  Object.defineProperty(navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(navigator, "standalone", {
    value: standalone,
    configurable: true,
  });
}

describe("linkPageManifest", () => {
  afterEach(() => setDevice(DESKTOP_UA, undefined));

  it("links the static manifest off iOS and in the home-screen app", () => {
    linkPageManifest();
    expect(manifestHrefs()).toEqual([STATIC_MANIFEST]);
    document.head.innerHTML = "";
    setDevice(IPHONE_UA, true);
    linkPageManifest();
    expect(manifestHrefs()).toEqual([STATIC_MANIFEST]);
  });

  it("links none in an iPhone browser tab, which waits for the hand-off one", () => {
    setDevice(IPHONE_UA, false);
    linkPageManifest();
    expect(manifestHrefs()).toEqual([]);
  });
});

describe("linkHandoffManifest", () => {
  it("links a data: manifest with the token in start_url", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => STATIC });
    vi.stubGlobal("fetch", fetchMock);
    const before = window.location.href;

    const link = await linkHandoffManifest("tok");
    expect(fetchMock).toHaveBeenCalledWith(STATIC_MANIFEST);
    expect(link?.isConnected).toBe(true);
    const [href] = manifestHrefs();
    expect(manifestHrefs()).toHaveLength(1);
    const prefix = "data:application/manifest+json;charset=utf-8,";
    expect(href?.startsWith(prefix)).toBe(true);
    const manifest = JSON.parse(decodeURIComponent(href!.slice(prefix.length)));
    expect(manifest.name).toBe("وِردك");
    expect(manifest.start_url).toBe(`${window.location.origin}/?h=tok`);
    expect(manifest.id).toBe(`${window.location.origin}/`);
    expect(window.location.href).toBe(before);
  });

  it("links nothing when the manifest cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await linkHandoffManifest("tok")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await linkHandoffManifest("tok")).toBeNull();
    expect(manifestHrefs()).toEqual([]);
  });
});
