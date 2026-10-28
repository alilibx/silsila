import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import invite from "../../api/invite";

const SHELL = `<head><!--og:start--><title>وِردك</title><!--og:end--></head>`;
const ENV = {
  WIRDAK_CONVEX_SITE_URL: "https://x.convex.site",
  PREVIEW_SECRET: "s3cret",
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(preview: () => Promise<Response>) {
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/preview")) return await preview();
    return new Response(SHELL, { headers: { "Content-Type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetchMock);
}

const REAL = {
  name: "ختمة العائلة",
  createdAt: 0,
  done: 18,
  round: 4,
  inviterName: "أحمد",
};

function req(path = "/api/invite?code=AAAAAAAAAAAA&from=BBBBBBBBBBB") {
  return new Request(`https://wirdak.app${path}`, {
    headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
  });
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api/invite", () => {
  it("injects the real preview and lets the edge cache it", async () => {
    stubFetch(async () => Response.json(REAL));
    const res = await invite.fetch(req());
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=300",
    );
    const html = await res.text();
    expect(html).toContain("ختمة العائلة · وِردك");
    expect(html).toContain("دعاك أحمد");
    expect(html).toContain(`content="https://wirdak.app/og.png"`);
    const call = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/preview"),
    );
    expect(String(call?.[0])).toBe(
      "https://x.convex.site/api/preview?code=AAAAAAAAAAAA&from=BBBBBBBBBBB",
    );
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers["X-Preview-Secret"]).toBe("s3cret");
    expect(headers["X-Visitor-Ip"]).toBe("203.0.113.9");
  });

  it("falls back to generic tags, uncached, on a non-200", async () => {
    for (const status of [404, 429, 401]) {
      stubFetch(async () => new Response("{}", { status }));
      const res = await invite.fetch(req());
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.text()).toContain("<title>وِردك</title>");
    }
  });

  it("falls back when the lookup throws or times out", async () => {
    stubFetch(async () => {
      throw new DOMException("timeout", "TimeoutError");
    });
    const res = await invite.fetch(req());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("<title>وِردك</title>");
  });

  it("falls back, without calling out, when unconfigured", async () => {
    vi.stubEnv("PREVIEW_SECRET", "");
    stubFetch(async () => Response.json(REAL));
    const res = await invite.fetch(req());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("/api/preview")),
    ).toBe(false);
  });

  it("falls back on a malformed lookup body", async () => {
    stubFetch(async () => Response.json({ nope: true }));
    const res = await invite.fetch(req());
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
