import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { ADMIN_SESSION_TTL_MS } from "./lib/adminSession";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

async function admin(t: T, token: string, phone: string) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", { phone, addedBy: null, addedAt: NOW }),
  );
  const tokenHash = await sha256Hex(token);
  await t.run((ctx) =>
    ctx.db.insert("adminSessions", {
      adminId,
      tokenHash,
      alertTokenHash: tokenHash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      expiresAt: NOW + ADMIN_SESSION_TTL_MS,
    }),
  );
  return adminId;
}

const keys = { p256dh: "p", auth: "a" };

async function visitorRequest(t: T, text: string) {
  const res = await t.mutation(internal.help.createAsVisitorInternal, {
    reporterHash: "visitor-hash",
    ip: null,
    inviteCode: null,
    text,
    screenshotId: null,
    voiceId: null,
    voiceSeconds: null,
    context: {
      path: "/",
      appVersion: "0.3.0",
      userAgent: "x",
      screen: "1x1",
      timeZone: "Asia/Dubai",
    },
  });
  if (!("requestId" in res)) throw new Error(JSON.stringify(res));
  return res.requestId;
}

test("an endpoint belongs to the admin who subscribed it last", async () => {
  const t = convexTest(schema, modules);
  await admin(t, "ali", "+971500000001");
  const sara = await admin(t, "sara", "+971500000002");
  const endpoint = "https://push.example/device";

  await t.mutation(api.adminPush.subscribe, {
    adminToken: "ali",
    endpoint,
    ...keys,
  });
  expect(
    await t.query(api.adminPush.mine, { adminToken: "ali", endpoint }),
  ).toMatchObject({ thisDevice: true, notifyHelp: true });

  await t.mutation(api.adminPush.subscribe, {
    adminToken: "sara",
    endpoint,
    ...keys,
  });
  const rows = await t.run((ctx) =>
    ctx.db.query("adminPushSubscriptions").collect(),
  );
  expect(rows.map((r) => r.adminId)).toEqual([sara]);
  expect(
    (await t.query(api.adminPush.mine, { adminToken: "ali", endpoint }))
      .thisDevice,
  ).toBe(false);

  await t.mutation(api.adminPush.unsubscribe, { adminToken: "sara", endpoint });
  expect(
    await t.run((ctx) => ctx.db.query("adminPushSubscriptions").collect()),
  ).toHaveLength(0);
});

test("the plan skips admins who turned help alerts off, and never carries the words", async () => {
  const t = convexTest(schema, modules);
  await admin(t, "ali", "+971500000001");
  await admin(t, "sara", "+971500000002");
  await t.mutation(api.adminPush.subscribe, {
    adminToken: "ali",
    endpoint: "https://push.example/ali",
    ...keys,
  });
  await t.mutation(api.adminPush.subscribe, {
    adminToken: "sara",
    endpoint: "https://push.example/sara",
    ...keys,
  });
  await t.mutation(api.adminPush.setNotify, {
    adminToken: "sara",
    kind: "help",
    on: false,
  });

  const requestId = await visitorRequest(t, "سرّي جداً");
  const plan = await t.query(internal.adminPush.deliveryPlan, {
    requestId,
    kind: "request",
  });
  expect(plan?.subscriptions.map((s) => s.endpoint)).toEqual([
    "https://push.example/ali",
  ]);
  expect(plan?.payload).toEqual({
    title: "وِردك · الإدارة",
    body: "طلب مساعدة جديد",
    url: `/help/${requestId}`,
    tag: `help-${requestId}`,
  });
  expect(JSON.stringify(plan)).not.toContain("سرّي");

  const message = await t.query(internal.adminPush.deliveryPlan, {
    requestId,
    kind: "message",
  });
  expect(message?.payload.body).toBe("رسالة جديدة في طلب مساعدة");
});

test("a new request schedules the admin push right away", async () => {
  const t = convexTest(schema, modules);
  await visitorRequest(t, "مساعدة");
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.map((s) => s.name)).toContain("pushNode:deliverToAdmins");
});

test("only admins can manage admin push", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.adminPush.subscribe, {
      adminToken: "nobody",
      endpoint: "https://push.example/x",
      ...keys,
    }),
  ).rejects.toThrow(/not_admin/);
});

test("summary and milestone pushes follow their own switches", async () => {
  const t = convexTest(schema, modules);
  await admin(t, "ali", "+971500000001");
  await admin(t, "sara", "+971500000002");
  for (const [token, endpoint] of [
    ["ali", "https://push.example/ali"],
    ["sara", "https://push.example/sara"],
  ]) {
    await t.mutation(api.adminPush.subscribe, {
      adminToken: token!,
      endpoint: endpoint!,
      ...keys,
    });
  }
  await t.mutation(api.adminPush.setNotify, {
    adminToken: "sara",
    kind: "summary",
    on: false,
  });
  await t.mutation(api.adminPush.setNotify, {
    adminToken: "ali",
    kind: "milestones",
    on: false,
  });

  const summary = await t.query(internal.adminPush.deliveryPlan, {
    kind: "summary",
    body: "أمس: …",
    tag: "summary-1",
  });
  expect(summary?.subscriptions.map((s) => s.endpoint)).toEqual([
    "https://push.example/ali",
  ]);
  expect(summary?.payload).toEqual({
    title: "وِردك · الإدارة",
    body: "أمس: …",
    url: "/",
    tag: "summary-1",
  });

  const milestone = await t.query(internal.adminPush.deliveryPlan, {
    kind: "milestone",
    body: "🎉",
    tag: "milestone-khatmas-100",
  });
  expect(milestone?.subscriptions.map((s) => s.endpoint)).toEqual([
    "https://push.example/sara",
  ]);

  expect(
    await t.query(api.adminPush.mine, { adminToken: "sara" }),
  ).toMatchObject({
    notifyHelp: true,
    notifySummary: false,
    notifyMilestones: true,
  });
});
