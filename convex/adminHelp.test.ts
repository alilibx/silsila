import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { ADMIN_SESSION_TTL_MS } from "./lib/adminSession";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const ctxFields = {
  path: "/",
  appVersion: "0.3.0",
  userAgent: "x",
  screen: "1x1",
  timeZone: "Asia/Dubai",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

async function admin(t: T, token = "admin") {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", {
      phone: "+971500000099",
      addedBy: null,
      addedAt: NOW,
    }),
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

async function member(t: T, token = "member") {
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "+971500000001",
      displayName: "سارة",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
  const hash = await sha256Hex(token);
  const sessionId = await t.run((ctx) =>
    ctx.db.insert("sessions", {
      personId,
      tokenHash: hash,
      alertTokenHash: hash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      lastUsedAt: NOW,
    }),
  );
  return { personId, sessionId };
}

async function memberRequest(t: T, text = "ما أقدر أدخل") {
  const res = await t.mutation(api.help.send, {
    sessionToken: "member",
    text,
    context: ctxFields,
  });
  if (!("requestId" in res)) throw new Error(JSON.stringify(res));
  return res.requestId;
}

async function visitorRequest(t: T) {
  const res = await t.mutation(internal.help.createAsVisitorInternal, {
    reporterHash: "visitor-hash",
    ip: null,
    inviteCode: null,
    text: "مساعدة",
    screenshotId: null,
    voiceId: null,
    voiceSeconds: null,
    context: ctxFields,
  });
  if (!("requestId" in res)) throw new Error(JSON.stringify(res));
  return res.requestId;
}

const page = { numItems: 10, cursor: null };

test("open requests are listed oldest first; visitors have no name", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await member(t);
  const first = await memberRequest(t);
  vi.setSystemTime(NOW + 1000);
  const second = await visitorRequest(t);

  const res = await t.query(api.adminHelp.list, {
    adminToken: "admin",
    status: "open",
    paginationOpts: page,
  });
  expect(res.page.map((r) => [r._id, r.who])).toEqual([
    [first, "سارة"],
    [second, null],
  ]);
  expect(res.page[0]).toMatchObject({
    firstLine: "ما أقدر أدخل",
    hasVoice: false,
    hasScreenshot: false,
  });

  const firstRow = await t.run((ctx) => ctx.db.get(first));
  expect(await t.query(api.adminHelp.counts, { adminToken: "admin" })).toEqual({
    open: 2,
    oldestOpenAt: firstRow?.createdAt,
  });
});

test("a reply answers the request and schedules a push, without an audit row", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  await member(t);
  const requestId = await memberRequest(t);

  expect(
    await t.mutation(api.adminHelp.reply, {
      adminToken: "admin",
      requestId,
      text: "  جرّب الآن  ",
    }),
  ).toEqual({ ok: true });
  const request = await t.run((ctx) => ctx.db.get(requestId));
  const messages = await t.run((ctx) =>
    ctx.db
      .query("helpMessages")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect(),
  );
  expect(messages.at(-1)).toMatchObject({ from: "team", text: "جرّب الآن" });
  expect(request).toMatchObject({
    status: "answered",
    answeredAt: messages.at(-1)?.createdAt,
  });
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.map((s) => s.name)).toContain("pushNode:deliverHelpReply");
  expect(await t.run((ctx) => ctx.db.query("auditLog").collect())).toHaveLength(
    0,
  );

  expect(
    await t.mutation(api.adminHelp.reply, {
      adminToken: "admin",
      requestId,
      text: "   ",
    }),
  ).toEqual({ error: "empty" });
});

test("close and reopen are audited", async () => {
  const t = convexTest(schema, modules);
  const adminId = await admin(t);
  await member(t);
  const requestId = await memberRequest(t);

  await t.mutation(api.adminHelp.close, { adminToken: "admin", requestId });
  expect((await t.run((ctx) => ctx.db.get(requestId)))?.status).toBe("closed");
  await t.mutation(api.adminHelp.reopen, { adminToken: "admin", requestId });
  expect((await t.run((ctx) => ctx.db.get(requestId)))?.status).toBe("open");

  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  expect(rows).toMatchObject([
    {
      adminId,
      action: "help.close",
      targetKind: "help",
      targetId: requestId,
      before: "open",
      after: "closed",
    },
    { action: "help.reopen", before: "closed", after: "open" },
  ]);
});

test("get shows the person, the khatma, and file URLs until they're deleted", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  const { personId } = await member(t);
  const shot = await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(10)], { type: "image/png" })),
  );
  const res = await t.mutation(api.help.send, {
    sessionToken: "member",
    text: "هنا",
    screenshotId: shot,
    context: ctxFields,
  });
  if (!("requestId" in res)) throw new Error();

  const got = await t.query(api.adminHelp.get, {
    adminToken: "admin",
    requestId: res.requestId,
  });
  expect(got?.person).toEqual({
    personId,
    displayName: "سارة",
    phone: "+971500000001",
  });
  expect(got?.context).toEqual(ctxFields);
  expect(got?.messages[0]?.screenshotUrl).toBeTruthy();

  await t.run((ctx) =>
    ctx.db.patch(res.requestId, { attachmentsDeletedAt: NOW }),
  );
  const later = await t.query(api.adminHelp.get, {
    adminToken: "admin",
    requestId: res.requestId,
  });
  expect(later?.messages[0]?.screenshotUrl).toBeNull();
  expect(later?.messages[0]?.text).toBe("هنا");
});

test("members can't reach the admin help functions", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const requestId = await memberRequest(t);
  await expect(
    t.query(api.adminHelp.counts, { adminToken: "member" }),
  ).rejects.toThrow(/not_admin/);
  await expect(
    t.mutation(api.adminHelp.reply, {
      adminToken: "member",
      requestId,
      text: "x",
    }),
  ).rejects.toThrow(/not_admin/);
});

async function replyMessage(t: T, requestId: Id<"helpRequests">) {
  await t.mutation(api.adminHelp.reply, {
    adminToken: "admin",
    requestId,
    text: "تم",
  });
  const messages = await t.run((ctx) =>
    ctx.db
      .query("helpMessages")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect(),
  );
  return messages.at(-1)!._id;
}

test("the reply push goes only to a person with notifications on somewhere", async () => {
  const t = convexTest(schema, modules);
  await admin(t);
  const { personId, sessionId } = await member(t);
  const requestId = await memberRequest(t);
  await t.run((ctx) =>
    ctx.db.insert("pushSubscriptions", {
      personId,
      sessionId,
      endpoint: "https://push.example/1",
      p256dh: "k",
      auth: "a",
      createdAt: NOW,
    }),
  );
  const khatmaId = await t.run((ctx) =>
    ctx.db.insert("khatmas", {
      name: null,
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: personId,
      inviteCode: "abcdefghijkl",
      completedRounds: 0,
      createdAt: NOW,
    }),
  );
  const memberId = await t.run((ctx) =>
    ctx.db.insert("members", {
      khatmaId,
      personId,
      joinedAt: NOW,
      status: "active",
      notificationsOn: false,
      lastNudgeAt: null,
      lastCelebratedRound: 0,
    }),
  );
  const messageId = await replyMessage(t, requestId);
  expect(await t.query(internal.push.helpReplyPlan, { messageId })).toBeNull();

  await t.run((ctx) => ctx.db.patch(memberId, { notificationsOn: true }));
  expect(await t.query(internal.push.helpReplyPlan, { messageId })).toEqual({
    subscriptions: [
      { endpoint: "https://push.example/1", p256dh: "k", auth: "a" },
    ],
    payload: {
      title: "وِردك",
      body: "رد من فريق وِردك على طلب المساعدة",
      url: `/?help=${requestId}`,
      tag: `help-${requestId}`,
    },
  });
});
