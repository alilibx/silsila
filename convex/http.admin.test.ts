import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const SITE = "https://wirdak.example";
const ADMIN_SITE = "https://admin.wirdak.example";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  // Not dev: only the configured origins are allowed.
  vi.stubEnv("WIRDAK_ENV", "prod");
  vi.stubEnv("WHATSAPP_PUBLIC_NUMBER", "971500000000");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("ADMIN_SITE_URL", ADMIN_SITE);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function post(
  t: ReturnType<typeof convexTest>,
  path: string,
  origin: string,
  body: unknown,
) {
  return t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

test("the admin start route only answers the admin origin", async () => {
  const t = convexTest(schema, modules);
  const site = await post(t, "/api/admin/verification/start", SITE, {
    clientKey: "c1",
  });
  expect(site.status).toBe(403);

  const pre = await t.fetch("/api/admin/verification/start", {
    method: "OPTIONS",
    headers: { Origin: ADMIN_SITE, "Access-Control-Request-Method": "POST" },
  });
  expect(pre.status).toBe(204);
  expect(pre.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_SITE);

  const res = await post(t, "/api/admin/verification/start", ADMIN_SITE, {
    clientKey: "c1",
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ADMIN_SITE);
  const body = (await res.json()) as {
    verificationId: string;
    secret: string;
    code: string;
    message: string;
  };
  expect(body.message).toBe(`رمز التحقق في وِردك: ${body.code}`);
  const row = await t.run(
    async (ctx) => (await ctx.db.query("verifications").collect())[0],
  );
  expect(row).toMatchObject({ surface: "admin", displayName: "" });
});

test("the website start route doesn't answer the admin origin", async () => {
  const t = convexTest(schema, modules);
  const res = await post(t, "/api/verification/start", ADMIN_SITE, {
    displayName: "علي",
    clientKey: "c1",
  });
  expect(res.status).toBe(403);
});

test("admin start works during maintenance", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "maintenanceMode",
      value: true,
      updatedAt: 0,
    }),
  );
  const site = await post(t, "/api/verification/start", SITE, {
    displayName: "علي",
    clientKey: "c1",
  });
  expect(site.status).toBe(503);
  const admin = await post(t, "/api/admin/verification/start", ADMIN_SITE, {
    clientKey: "c1",
  });
  expect(admin.status).toBe(200);
});

test("a bad admin start body is refused", async () => {
  const t = convexTest(schema, modules);
  const res = await post(t, "/api/admin/verification/start", ADMIN_SITE, {});
  expect(res.status).toBe(400);
});
