import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const VISITOR = "visitor-token-0123456789abcdef";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

const context = {
  path: "/j/abc",
  appVersion: "0.3.0",
  userAgent: "Mozilla/5.0 (iPhone)",
  screen: "390x844",
  timeZone: "Asia/Dubai",
};

async function member(t: T, token = "member", phone = "+971500000001") {
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone,
      displayName: "علي",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
  const hash = await sha256Hex(token);
  await t.run((ctx) =>
    ctx.db.insert("sessions", {
      personId,
      tokenHash: hash,
      alertTokenHash: hash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      lastUsedAt: NOW,
    }),
  );
  return personId;
}

async function khatma(t: T, creator: Id<"people">, inviteCode: string) {
  return await t.run(async (ctx) => {
    const khatmaId = await ctx.db.insert("khatmas", {
      name: "ختمة العائلة",
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: creator,
      inviteCode,
      completedRounds: 0,
      createdAt: NOW,
    });
    return khatmaId;
  });
}

async function join(t: T, khatmaId: Id<"khatmas">, personId: Id<"people">) {
  await t.run((ctx) =>
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
}

function store(t: T, bytes: number, type: string) {
  return t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })),
  );
}

function send(t: T, args: Record<string, unknown>, token = "member") {
  return t.mutation(api.help.send, {
    sessionToken: token,
    context,
    ...args,
  } as never);
}

async function visitorRequest(t: T, token = VISITOR) {
  return await t.mutation(internal.help.createAsVisitorInternal, {
    reporterHash: await sha256Hex(token),
    ip: null,
    inviteCode: null,
    text: "ما أقدر أدخل",
    screenshotId: null,
    voiceId: null,
    voiceSeconds: null,
    context,
  });
}

test("a member's first message opens a request with its context", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const res = await send(t, { text: "  ما أقدر أدخل  " });
  if (!("requestId" in res)) throw new Error(JSON.stringify(res));

  const mine = await t.query(api.help.mine, { sessionToken: "member" });
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ _id: res.requestId, status: "open" });
  expect(mine[0]?.messages).toMatchObject([
    { from: "person", text: "ما أقدر أدخل", hasScreenshot: false },
  ]);
  const row = await t.run((ctx) => ctx.db.get(res.requestId));
  expect(row?.context).toEqual(context);
});

test("bad input is refused, and refused files are deleted", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  expect(await send(t, { text: "x".repeat(1001) })).toEqual({
    error: "too_long",
  });

  const shot = await store(t, 100, "image/png");
  expect(await send(t, { screenshotId: shot })).toEqual({ error: "empty" });

  const notImage = await store(t, 100, "text/plain");
  expect(await send(t, { text: "hi", screenshotId: notImage })).toEqual({
    error: "bad_file",
  });
  expect(await t.run((ctx) => ctx.db.system.get(notImage))).toBeNull();

  const huge = await store(t, 3 * 1024 * 1024, "image/png");
  expect(await send(t, { text: "hi", screenshotId: huge })).toEqual({
    error: "bad_file",
  });

  const longVoice = await store(t, 1000, "audio/mp4");
  expect(await send(t, { voiceId: longVoice, voiceSeconds: 121 })).toEqual({
    error: "bad_file",
  });
});

test("webm voice notes with a codec are accepted", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const voice = await store(t, 1000, "audio/webm;codecs=opus");
  const res = await send(t, { voiceId: voice, voiceSeconds: 12.4 });
  expect("requestId" in res).toBe(true);
  const mine = await t.query(api.help.mine, { sessionToken: "member" });
  expect(mine[0]?.messages[0]).toMatchObject({ voiceSeconds: 12 });
  expect(mine[0]?.messages[0]?.voiceUrl).toBeTruthy();
});

test("a file can't be attached twice", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const shot = await store(t, 100, "image/jpeg");
  const first = await send(t, { text: "a", screenshotId: shot });
  expect("requestId" in first).toBe(true);
  expect(await send(t, { text: "b", screenshotId: shot })).toEqual({
    error: "bad_file",
  });
});

test("new requests and messages are limited", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  for (let i = 0; i < 5; i++) {
    expect("requestId" in (await send(t, { text: `r${i}` }))).toBe(true);
  }
  expect(await send(t, { text: "r6" })).toEqual({ error: "rate_limited" });

  vi.setSystemTime(NOW + DAY + 1);
  const res = await send(t, { text: "next day" });
  if (!("requestId" in res)) throw new Error(JSON.stringify(res));
  // 20 per hour in all: the new request was the first.
  for (let i = 0; i < 19; i++) {
    expect(
      "requestId" in
        (await send(t, { requestId: res.requestId, text: `m${i}` })),
    ).toBe(true);
  }
  expect(await send(t, { requestId: res.requestId, text: "m20" })).toEqual({
    error: "rate_limited",
  });
});

test("the khatma is attached only for a member of it", async () => {
  const t = convexTest(schema, modules);
  const ali = await member(t);
  const mine = await khatma(t, ali, "mineKhatma01");
  await join(t, mine, ali);
  const other = await member(t, "other", "+971500000009");
  await khatma(t, other, "otherKhatma1");

  const a = await send(t, { text: "a", inviteCode: "mineKhatma01" });
  const b = await send(t, { text: "b", inviteCode: "otherKhatma1" });
  if (!("requestId" in a) || !("requestId" in b)) throw new Error();
  expect((await t.run((ctx) => ctx.db.get(a.requestId)))?.khatmaId).toBe(mine);
  expect((await t.run((ctx) => ctx.db.get(b.requestId)))?.khatmaId).toBeNull();
});

test("a visitor's request is invisible to another token", async () => {
  const t = convexTest(schema, modules);
  const created = await visitorRequest(t);
  if (!("requestId" in created)) throw new Error(JSON.stringify(created));
  const requestId = created.requestId;

  const wrong = "someone-else-token-0123456789";
  expect(await t.query(api.help.mine, { reporterToken: wrong })).toEqual([]);
  expect(await t.query(api.help.mine, {})).toEqual([]);
  expect(
    await t.mutation(api.help.sendAsVisitor, {
      reporterToken: wrong,
      requestId,
      text: "hi",
    }),
  ).toEqual({ error: "not_found" });
  await t.mutation(api.help.markSeen, { requestId, reporterToken: wrong });
  expect((await t.run((ctx) => ctx.db.get(requestId)))?.seenAt).toBeNull();

  expect(
    await t.mutation(internal.help.uploadUrlInternal, {
      reporterHash: await sha256Hex(wrong),
      requestId,
      ip: "203.0.113.7",
    }),
  ).toEqual({ error: "not_found" });
  expect(
    typeof (await t.mutation(internal.help.uploadUrlInternal, {
      reporterHash: await sha256Hex(VISITOR),
      requestId,
      ip: "203.0.113.7",
    })),
  ).toBe("string");

  const mine = await t.query(api.help.mine, { reporterToken: VISITOR });
  expect(mine.map((r) => r._id)).toEqual([requestId]);
  expect(mine[0]?.messages[0]?.from).toBe("visitor");
});

test("answering back reopens a closed request", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const res = await send(t, { text: "a" });
  if (!("requestId" in res)) throw new Error();
  await t.run((ctx) =>
    ctx.db.patch(res.requestId, { status: "closed", closedAt: NOW }),
  );
  await send(t, { requestId: res.requestId, text: "still broken" });
  const row = await t.run((ctx) => ctx.db.get(res.requestId));
  expect(row).toMatchObject({ status: "open", closedAt: null });
});

test("a team reply is unread until the person opens it", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const res = await send(t, { text: "a" });
  if (!("requestId" in res)) throw new Error();
  vi.setSystemTime(NOW + 1000);
  await t.run((ctx) =>
    ctx.db.insert("helpMessages", {
      requestId: res.requestId,
      from: "team",
      text: "جرّب الآن",
      screenshotId: null,
      voiceId: null,
      voiceSeconds: null,
      createdAt: NOW + 1000,
    }),
  );
  expect(
    (await t.query(api.help.mine, { sessionToken: "member" }))[0]?.unread,
  ).toBe(true);
  vi.setSystemTime(NOW + 2000);
  await t.mutation(api.help.markSeen, {
    requestId: res.requestId,
    sessionToken: "member",
  });
  expect(
    (await t.query(api.help.mine, { sessionToken: "member" }))[0]?.unread,
  ).toBe(false);
});

test("signing in moves a visitor's requests to the account", async () => {
  const t = convexTest(schema, modules);
  await visitorRequest(t);
  vi.setSystemTime(NOW + 1000);
  await visitorRequest(t);
  await member(t);

  expect(
    await t.mutation(api.help.claimVisitorRequests, {
      sessionToken: "member",
      reporterToken: VISITOR,
    }),
  ).toEqual({ moved: 2 });
  expect(await t.query(api.help.mine, { sessionToken: "member" })).toHaveLength(
    2,
  );
  expect(await t.query(api.help.mine, { reporterToken: VISITOR })).toEqual([]);
});

test("help works during maintenance", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "maintenanceMode",
      value: true,
      updatedAt: 0,
    }),
  );
  expect("requestId" in (await send(t, { text: "help" }))).toBe(true);
});

test("an answered request with no word back closes after 14 days", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const res = await send(t, { text: "a" });
  if (!("requestId" in res)) throw new Error();
  await t.run((ctx) =>
    ctx.db.patch(res.requestId, { status: "answered", answeredAt: NOW }),
  );

  vi.setSystemTime(NOW + 13 * DAY);
  await t.mutation(internal.help.autoClose, {});
  expect((await t.run((ctx) => ctx.db.get(res.requestId)))?.status).toBe(
    "answered",
  );

  vi.setSystemTime(NOW + 14 * DAY + 60_000);
  await t.mutation(internal.help.autoClose, {});
  const row = await t.run((ctx) => ctx.db.get(res.requestId));
  expect(row?.status).toBe("closed");
  expect(row?.closedAt).toBeGreaterThan(NOW + 14 * DAY);
});

test("a conversation stops taking messages at 200", async () => {
  const t = convexTest(schema, modules);
  await member(t);
  const res = await send(t, { text: "a" });
  if (!("requestId" in res)) throw new Error();
  await t.run(async (ctx) => {
    for (let i = 1; i < 200; i++) {
      await ctx.db.insert("helpMessages", {
        requestId: res.requestId,
        from: "person",
        text: `m${i}`,
        screenshotId: null,
        voiceId: null,
        voiceSeconds: null,
        createdAt: NOW + i,
      });
    }
  });
  expect(await send(t, { requestId: res.requestId, text: "one more" })).toEqual(
    { error: "rate_limited" },
  );
});
