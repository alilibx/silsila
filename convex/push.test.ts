import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import { notify } from "./notes";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type T = TestConvexForDataModel<DataModel>;

let seq = 0;
async function setup(t: T, personId?: Id<"people">) {
  seq += 1;
  const token = `tok-${seq}`;
  const tokenHash = await sha256Hex(token);
  const alertTokenHash = await sha256Hex(`alert-${seq}`);
  return await t.run(async (ctx) => {
    const pid =
      personId ??
      (await ctx.db.insert("people", {
        phone: `+97150001${String(seq).padStart(4, "0")}`,
        displayName: `عضو ${seq}`,
        verifiedAt: 0,
        timeZone: "Asia/Dubai",
        lastSeenAt: NOW,
      }));
    const sessionId = await ctx.db.insert("sessions", {
      personId: pid,
      tokenHash,
      alertTokenHash,
      deviceLabel: "test",
      createdAt: NOW,
      lastUsedAt: NOW,
    });
    return { personId: pid, sessionId, token, alertToken: `alert-${seq}` };
  });
}
type Who = Awaited<ReturnType<typeof setup>>;

async function addKhatma(t: T, organizer: Who) {
  return await t.run((ctx) =>
    ctx.db.insert("khatmas", {
      name: null,
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: organizer.personId,
      inviteCode: "invite000001",
      completedRounds: 0,
      createdAt: NOW,
    }),
  );
}

async function join(t: T, khatmaId: Id<"khatmas">, who: Who) {
  await t.run((ctx) =>
    ctx.db.insert("members", {
      khatmaId,
      personId: who.personId,
      joinedAt: NOW,
      status: "active",
      notificationsOn: true,
      lastNudgeAt: null,
      lastCelebratedRound: 0,
    }),
  );
}

const keys = (n: number) => ({
  endpoint: `https://push.example/${n}`,
  p256dh: `p${n}`,
  auth: `a${n}`,
});

async function subscriptions(t: T) {
  return await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
}

test("publicKey reads VAPID_PUBLIC_KEY, null when unset", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("VAPID_PUBLIC_KEY", "");
  expect(await t.query(api.push.publicKey, {})).toBeNull();
  vi.stubEnv("VAPID_PUBLIC_KEY", "BKey123");
  expect(await t.query(api.push.publicKey, {})).toBe("BKey123");
});

test("subscribe stores a subscription for the session, upserting by endpoint", async () => {
  const t = convexTest(schema, modules);
  const ali = await setup(t);
  expect(
    await t.mutation(api.push.subscribe, {
      sessionToken: ali.token,
      ...keys(1),
    }),
  ).toEqual({ ok: true });
  await t.mutation(api.push.subscribe, {
    sessionToken: ali.token,
    endpoint: keys(1).endpoint,
    p256dh: "new-p",
    auth: "new-a",
  });
  const rows = await subscriptions(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    personId: ali.personId,
    sessionId: ali.sessionId,
    endpoint: keys(1).endpoint,
    p256dh: "new-p",
    auth: "new-a",
  });
});

test("subscribe needs a session and a plausible endpoint", async () => {
  const t = convexTest(schema, modules);
  const ali = await setup(t);
  await expect(t.mutation(api.push.subscribe, keys(1))).rejects.toThrow(
    /not_signed_in/,
  );
  expect(
    await t.mutation(api.push.subscribe, {
      sessionToken: ali.token,
      endpoint: "http://insecure.example/x",
      p256dh: "p",
      auth: "a",
    }),
  ).toEqual({ ok: false });
  expect(
    await t.mutation(api.push.subscribe, {
      sessionToken: ali.token,
      endpoint: "https://push.example/x",
      p256dh: "",
      auth: "a",
    }),
  ).toEqual({ ok: false });
  expect(await subscriptions(t)).toHaveLength(0);
});

test("subscribing an endpoint already owned by another person moves it", async () => {
  const t = convexTest(schema, modules);
  const a = await setup(t);
  const b = await setup(t);
  const khatmaId = await addKhatma(t, a);
  await join(t, khatmaId, a);
  await join(t, khatmaId, b);
  await t.mutation(api.push.subscribe, { sessionToken: a.token, ...keys(1) });
  const aNote = await t.run((ctx) =>
    notify(ctx, { personId: a.personId, khatmaId, kind: "completed" }),
  );
  expect(
    (await t.query(internal.push.deliveryPlan, { noteId: aNote }))
      ?.subscriptions,
  ).toHaveLength(1);

  await t.mutation(api.push.subscribe, { sessionToken: b.token, ...keys(1) });
  const rows = await subscriptions(t);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    personId: b.personId,
    sessionId: b.sessionId,
  });
  expect(
    await t.query(internal.push.deliveryPlan, { noteId: aNote }),
  ).toBeNull();
  const bNote = await t.run((ctx) =>
    notify(ctx, { personId: b.personId, khatmaId, kind: "completed" }),
  );
  expect(
    (await t.query(internal.push.deliveryPlan, { noteId: bNote }))
      ?.subscriptions,
  ).toHaveLength(1);
});

test("a person keeps at most 10 subscriptions, dropping the oldest", async () => {
  const t = convexTest(schema, modules);
  const ali = await setup(t);
  for (let i = 1; i <= 11; i++) {
    vi.setSystemTime(NOW + i * 1000);
    await t.mutation(api.push.subscribe, {
      sessionToken: ali.token,
      ...keys(i),
    });
  }
  const endpoints = (await subscriptions(t)).map((r) => r.endpoint).sort();
  expect(endpoints).toHaveLength(10);
  expect(endpoints).not.toContain(keys(1).endpoint);
  expect(endpoints).toContain(keys(11).endpoint);
});

test("unsubscribe removes the caller's subscription only", async () => {
  const t = convexTest(schema, modules);
  const a = await setup(t);
  const b = await setup(t);
  await t.mutation(api.push.subscribe, { sessionToken: a.token, ...keys(1) });
  await t.mutation(api.push.subscribe, { sessionToken: b.token, ...keys(2) });

  await t.mutation(api.push.unsubscribe, {
    sessionToken: b.token,
    endpoint: keys(1).endpoint,
  });
  expect(await subscriptions(t)).toHaveLength(2);

  await t.mutation(api.push.unsubscribe, {
    sessionToken: a.token,
    endpoint: keys(1).endpoint,
  });
  expect((await subscriptions(t)).map((r) => r.endpoint)).toEqual([
    keys(2).endpoint,
  ]);
});

test("mine says whether this device's endpoint is stored for the caller", async () => {
  const t = convexTest(schema, modules);
  const a = await setup(t);
  const b = await setup(t);
  await t.mutation(api.push.subscribe, { sessionToken: a.token, ...keys(1) });
  const q = (who: Who | null, endpoint?: string) =>
    t.query(api.push.mine, { sessionToken: who?.token, endpoint });
  expect(await q(a, keys(1).endpoint)).toEqual({ thisDevice: true });
  expect(await q(a, keys(2).endpoint)).toEqual({ thisDevice: false });
  expect(await q(a)).toEqual({ thisDevice: false });
  expect(await q(b, keys(1).endpoint)).toEqual({ thisDevice: false });
  expect(await q(null, keys(1).endpoint)).toEqual({ thisDevice: false });
});

test("removeGone deletes subscriptions and markPushed stamps the note", async () => {
  const t = convexTest(schema, modules);
  const ali = await setup(t);
  const khatmaId = await addKhatma(t, ali);
  await join(t, khatmaId, ali);
  await t.mutation(api.push.subscribe, { sessionToken: ali.token, ...keys(1) });
  await t.mutation(api.push.subscribe, { sessionToken: ali.token, ...keys(2) });

  await t.mutation(internal.push.removeGone, {
    endpoints: [keys(1).endpoint, "https://push.example/unknown"],
  });
  expect((await subscriptions(t)).map((r) => r.endpoint)).toEqual([
    keys(2).endpoint,
  ]);

  const noteId = await t.run((ctx) =>
    notify(ctx, { personId: ali.personId, khatmaId, kind: "completed" }),
  );
  vi.setSystemTime(NOW + 5000);
  await t.mutation(internal.push.markPushed, { noteId });
  expect((await t.run((ctx) => ctx.db.get(noteId)))?.pushedAt).toBe(NOW + 5000);
});

async function addHandoff(t: T, who: Who) {
  await t.run((ctx) =>
    ctx.db.insert("handoffTokens", {
      tokenHash: `h-${who.sessionId}`,
      personId: who.personId,
      sessionId: who.sessionId,
      createdAt: NOW,
      expiresAt: NOW + 1000,
      usedAt: null,
    }),
  );
}

const remaining = (t: T) =>
  t.run(async (ctx) => ({
    sessions: (await ctx.db.query("sessions").collect()).map((s) => s._id),
    subs: (await ctx.db.query("pushSubscriptions").collect()).map(
      (s) => s.endpoint,
    ),
    handoffs: (await ctx.db.query("handoffTokens").collect()).map(
      (h) => h.sessionId,
    ),
  }));

test("signing out deletes that session's subscriptions and hand-off tokens", async () => {
  const t = convexTest(schema, modules);
  const phone1 = await setup(t);
  const other = await setup(t);
  await t.mutation(api.push.subscribe, {
    sessionToken: phone1.token,
    ...keys(1),
  });
  await t.mutation(api.push.subscribe, {
    sessionToken: other.token,
    ...keys(2),
  });
  await addHandoff(t, phone1);
  await addHandoff(t, other);

  await t.mutation(api.sessions.signOut, { sessionToken: phone1.token });
  expect(await remaining(t)).toEqual({
    sessions: [other.sessionId],
    subs: [keys(2).endpoint],
    handoffs: [other.sessionId],
  });
});

test("every other sign-out path also removes subscriptions and hand-off tokens", async () => {
  const t = convexTest(schema, modules);
  const first = await setup(t);
  const second = await setup(t, first.personId);
  const third = await setup(t, first.personId);
  for (const [i, who] of [first, second, third].entries()) {
    await t.mutation(api.push.subscribe, {
      sessionToken: who.token,
      ...keys(i + 1),
    });
    await addHandoff(t, who);
  }

  // signOutOne
  await t.mutation(api.sessions.signOutOne, {
    sessionToken: first.token,
    sessionId: third.sessionId,
  });
  expect((await remaining(t)).subs.sort()).toEqual([
    keys(1).endpoint,
    keys(2).endpoint,
  ]);
  expect((await remaining(t)).handoffs).not.toContain(third.sessionId);

  // signOutOthers
  await t.mutation(api.sessions.signOutOthers, { sessionToken: first.token });
  expect(await remaining(t)).toEqual({
    sessions: [first.sessionId],
    subs: [keys(1).endpoint],
    handoffs: [first.sessionId],
  });

  // signOutOthersByAlertToken
  await t.mutation(api.sessions.signOutOthersByAlertToken, {
    alertToken: first.alertToken,
  });
  expect(await remaining(t)).toEqual({ sessions: [], subs: [], handoffs: [] });
});
