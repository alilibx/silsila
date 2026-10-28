import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const HOME_SCREEN = "iPhone · الشاشة الرئيسية";

type T = TestConvexForDataModel<DataModel>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WIRDAK_ENV", "dev");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signedIn(t: T, token = "tok_safari") {
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "971501234567",
      displayName: "علي",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
  const tokenHash = await sha256Hex(token);
  const alertTokenHash = await sha256Hex(`alert_${token}`);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("sessions", {
      personId,
      tokenHash,
      alertTokenHash,
      deviceLabel: "iPhone Safari",
      createdAt: 0,
      lastUsedAt: 0,
    }),
  );
  return { personId, sessionId, token };
}

async function mint(t: T, sessionToken: string): Promise<string> {
  const res = await t.action(api.handoff.create, { sessionToken });
  if ("error" in res) throw new Error(res.error);
  return res.token;
}

test("create needs a signed-in session", async () => {
  const t = convexTest(schema, modules);
  expect(await t.action(api.handoff.create, { sessionToken: "nope" })).toEqual({
    error: "not_signed_in",
  });
});

test("create stores only the hash, tied to the person and session, with a 30 minute expiry", async () => {
  const t = convexTest(schema, modules);
  const { personId, sessionId, token } = await signedIn(t);
  const raw = await mint(t, token);
  expect(raw).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  const rows = await t.run((ctx) => ctx.db.query("handoffTokens").collect());
  expect(rows).toHaveLength(1);
  expect(JSON.stringify(rows)).not.toContain(raw);
  expect(rows[0]).toMatchObject({
    tokenHash: await sha256Hex(raw),
    personId,
    sessionId,
    usedAt: null,
  });
  // convex-test's clock may tick a millisecond or two inside a call.
  expect(rows[0]?.expiresAt).toBe((rows[0]?.createdAt ?? 0) + 30 * MIN);
  expect(rows[0]?.createdAt).toBeGreaterThanOrEqual(NOW);
  expect(rows[0]?.createdAt).toBeLessThan(NOW + 1000);
});

test("redeem once gives a session for the same person; second redeem is invalid", async () => {
  const t = convexTest(schema, modules);
  const { personId, token } = await signedIn(t);
  const raw = await mint(t, token);

  const first = await t.action(api.handoff.redeem, {
    token: raw,
    timeZone: "Asia/Dubai",
  });
  if ("error" in first) throw new Error(first.error);
  const resolved = await t.query(api.sessions.list, {
    sessionToken: first.sessionToken,
  });
  expect(resolved.some((s) => s.isCurrent)).toBe(true);
  const rows = await t.run((ctx) => ctx.db.query("handoffTokens").collect());
  expect(rows[0]?.usedAt).toBeGreaterThanOrEqual(NOW);
  expect(rows[0]?.usedAt).toBeLessThan(NOW + 1000);
  const sessions = await t.run((ctx) =>
    ctx.db
      .query("sessions")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect(),
  );
  expect(sessions).toHaveLength(2);

  expect(
    await t.action(api.handoff.redeem, { token: raw, timeZone: "Asia/Dubai" }),
  ).toEqual({ error: "invalid" });
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("sessions")
        .withIndex("by_person", (q) => q.eq("personId", personId))
        .collect(),
    ),
  ).toHaveLength(2);
});

test("concurrent redeems: exactly one wins", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  const results = await Promise.all([
    t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
    t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
  ]);
  expect(results.filter((r) => "sessionToken" in r)).toHaveLength(1);
  expect(results.filter((r) => "error" in r)).toHaveLength(1);
});

test("an unknown token is invalid", async () => {
  const t = convexTest(schema, modules);
  expect(
    await t.action(api.handoff.redeem, { token: "garbage", timeZone: "UTC" }),
  ).toEqual({ error: "invalid" });
});

test("expired after 30 minutes", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  vi.setSystemTime(NOW + 30 * MIN + 1);
  expect(
    await t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
  ).toEqual({ error: "invalid" });
});

test("still valid just before 30 minutes", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  vi.setSystemTime(NOW + 30 * MIN - 1000);
  const res = await t.action(api.handoff.redeem, {
    token: raw,
    timeZone: "UTC",
  });
  expect("sessionToken" in res).toBe(true);
});

test("dead after the creating session signs out", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  await t.mutation(api.sessions.signOut, { sessionToken: token });
  expect(
    await t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
  ).toEqual({ error: "invalid" });
});

test("dead when the creating session was removed without its tokens", async () => {
  const t = convexTest(schema, modules);
  const { token, sessionId } = await signedIn(t);
  const raw = await mint(t, token);
  await t.run((ctx) => ctx.db.delete(sessionId));
  expect(
    await t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
  ).toEqual({ error: "invalid" });
});

test("redeem sends no WhatsApp message", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  const res = await t.action(api.handoff.redeem, {
    token: raw,
    timeZone: "UTC",
  });
  expect("sessionToken" in res).toBe(true);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetchMock).not.toHaveBeenCalled();
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toEqual([]);
});

test("the new session appears in sessions.list with the home-screen label", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  const res = await t.action(api.handoff.redeem, {
    token: raw,
    timeZone: "UTC",
  });
  if ("error" in res) throw new Error(res.error);
  const rows = await t.query(api.sessions.list, { sessionToken: token });
  expect(rows.map((r) => r.deviceLabel).sort()).toEqual(
    [HOME_SCREEN, "iPhone Safari"].sort(),
  );
  const alerts = await t.run((ctx) => ctx.db.query("sessions").collect());
  const fresh = alerts.find((s) => s.deviceLabel === HOME_SCREEN);
  expect(fresh?.tokenHash).toBe(await sha256Hex(res.sessionToken));
  expect(fresh?.alertTokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(fresh?.alertTokenHash).not.toBe(fresh?.tokenHash);
});

test("redeem refreshes the person's time zone, cleaned", async () => {
  const t = convexTest(schema, modules);
  const { personId, token } = await signedIn(t);
  const raw = await mint(t, token);
  await t.action(api.handoff.redeem, { token: raw, timeZone: "Europe/London" });
  expect((await t.run((ctx) => ctx.db.get(personId)))?.timeZone).toBe(
    "Europe/London",
  );
  const raw2 = await mint(t, token);
  await t.action(api.handoff.redeem, { token: raw2, timeZone: "Not/AZone" });
  expect((await t.run((ctx) => ctx.db.get(personId)))?.timeZone).toBe("UTC");
});

test("redeem is rate-limited and answers the same invalid", async () => {
  const t = convexTest(schema, modules);
  const { token } = await signedIn(t);
  const raw = await mint(t, token);
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "handoffRedeemGlobalPerMinute",
      value: 0,
      updatedAt: 0,
    }),
  );
  expect(
    await t.action(api.handoff.redeem, { token: raw, timeZone: "UTC" }),
  ).toEqual({ error: "invalid" });
  const rows = await t.run((ctx) => ctx.db.query("handoffTokens").collect());
  expect(rows[0]?.usedAt).toBeNull();
});
