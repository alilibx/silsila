import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SITE = "https://wirdak.example";
const ADMIN_SITE = "https://admin.wirdak.example";
const TOKEN = "visitor-token-0123456789abcdef";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  vi.stubEnv("WIRDAK_ENV", "prod");
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("ADMIN_SITE_URL", ADMIN_SITE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type T = ReturnType<typeof convexTest>;

function post(
  t: T,
  path: string,
  body: unknown,
  origin = SITE,
  ip = "203.0.113.7",
) {
  return t.fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "X-Forwarded-For": ip,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const request = (token = TOKEN, text = "ما أقدر أدخل") => ({
  reporterToken: token,
  text,
  context: {
    path: "/",
    appVersion: "0.3.0",
    userAgent: "x",
    screen: "1x1",
    timeZone: "Asia/Dubai",
  },
});

test("only the website origin may send help requests", async () => {
  const t = convexTest(schema, modules);
  expect(
    (await post(t, "/api/help/request", request(), ADMIN_SITE)).status,
  ).toBe(403);
  expect(
    (await post(t, "/api/help/request", request(), "https://evil.example"))
      .status,
  ).toBe(403);
  const res = await post(t, "/api/help/request", request());
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  const pre = await t.fetch("/api/help/request", {
    method: "OPTIONS",
    headers: { Origin: SITE, "Access-Control-Request-Method": "POST" },
  });
  expect(pre.status).toBe(204);
});

test("a request stores the token's hash, never the token", async () => {
  const t = convexTest(schema, modules);
  const res = await post(t, "/api/help/request", request());
  const { requestId } = (await res.json()) as { requestId: string };
  const row = await t.run(
    async (ctx) => (await ctx.db.query("helpRequests").collect())[0],
  );
  expect(row?._id).toBe(requestId);
  expect(row?.reporterHash).toBe(await sha256Hex(TOKEN));
  expect(JSON.stringify(row)).not.toContain(TOKEN);
});

test("an IP gets 10 requests a day, a token 3", async () => {
  const t = convexTest(schema, modules);
  for (let i = 0; i < 3; i++) {
    expect((await post(t, "/api/help/request", request())).status).toBe(200);
  }
  expect((await post(t, "/api/help/request", request())).status).toBe(429);

  for (let i = 0; i < 7; i++) {
    const token = `another-visitor-token-${i}-0123456`;
    expect((await post(t, "/api/help/request", request(token))).status).toBe(
      200,
    );
  }
  // 10 from this IP now: a fresh token is still refused.
  const res = await post(
    t,
    "/api/help/request",
    request("fresh-visitor-token-abcdefghij"),
  );
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ error: "rate_limited" });
});

test("bad bodies are refused", async () => {
  const t = convexTest(schema, modules);
  expect((await post(t, "/api/help/request", request("short"))).status).toBe(
    400,
  );
  expect((await post(t, "/api/help/request", "x".repeat(9000))).status).toBe(
    413,
  );
  expect((await post(t, "/api/help/request", "{not json")).status).toBe(400);
  expect(
    (await post(t, "/api/help/request", { ...request(), screenshotId: "nope" }))
      .status,
  ).toBe(400);
  const empty = await post(t, "/api/help/request", request(TOKEN, "   "));
  expect(empty.status).toBe(400);
  expect(await empty.json()).toEqual({ error: "empty" });
});

test("upload URLs for visitors are limited per IP", async () => {
  const t = convexTest(schema, modules);
  const ok = await post(t, "/api/help/upload-url", { reporterToken: TOKEN });
  expect(ok.status).toBe(200);
  expect(typeof ((await ok.json()) as { uploadUrl: string }).uploadUrl).toBe(
    "string",
  );
  for (let i = 1; i < 30; i++) {
    await post(t, "/api/help/upload-url", {
      reporterToken: `upload-token-${i}-0123456789`,
    });
  }
  expect(
    (
      await post(t, "/api/help/upload-url", {
        reporterToken: "last-upload-token-0123456789",
      })
    ).status,
  ).toBe(429);
  expect(
    (await post(t, "/api/help/upload-url", { reporterToken: "x" })).status,
  ).toBe(400);
});

test("follow-up uploads go over HTTP too, so they count against the IP", async () => {
  const t = convexTest(schema, modules);
  const created = await post(t, "/api/help/request", request());
  const { requestId } = (await created.json()) as { requestId: string };

  const wrong = await post(t, "/api/help/upload-url", {
    reporterToken: "another-visitor-token-0123456789",
    requestId,
  });
  expect(wrong.status).toBe(404);

  for (let i = 0; i < 20; i++) {
    expect(
      (
        await post(t, "/api/help/upload-url", {
          reporterToken: TOKEN,
          requestId,
        })
      ).status,
    ).toBe(200);
  }
  // 20 per token per hour.
  expect(
    (await post(t, "/api/help/upload-url", { reporterToken: TOKEN, requestId }))
      .status,
  ).toBe(429);
});
