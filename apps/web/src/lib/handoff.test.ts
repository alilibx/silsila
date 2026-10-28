import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHandoffToken,
  handoffManifest,
  installHandoffManifest,
  redeemHandoffToken,
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

describe("installHandoffManifest", () => {
  it("swaps the manifest link for a blob and restores the original", async () => {
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest">';
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    )!;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => STATIC }),
    );
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:test/1";
    });
    URL.revokeObjectURL = vi.fn();
    const before = window.location.href;

    const restore = await installHandoffManifest("tok");
    expect(link.getAttribute("href")).toBe("blob:test/1");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob!);
    });
    const manifest = JSON.parse(text);
    expect(manifest.start_url).toBe(`${window.location.origin}/?h=tok`);
    expect(manifest.id).toBe(`${window.location.origin}/`);
    expect(window.location.href).toBe(before);

    restore();
    expect(link.getAttribute("href")).toBe("/manifest.webmanifest");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("leaves the page alone when the manifest cannot be read", async () => {
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest">';
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const restore = await installHandoffManifest("tok");
    expect(
      document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    ).toBe("/manifest.webmanifest");
    expect(() => restore()).not.toThrow();
  });
});
