import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
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

let seq = 0;

/** A person with a live session; returns the raw session token. */
async function signedIn(t: T, displayName: string) {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000000${String(seq).padStart(2, "0")}`,
      displayName,
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    });
    await ctx.db.insert("sessions", {
      personId: id,
      tokenHash,
      alertTokenHash: `alert-${seq}`,
      deviceLabel: "test",
      createdAt: NOW,
      lastUsedAt: NOW,
    });
    return id;
  });
  return { personId, token, displayName };
}
type Who = Awaited<ReturnType<typeof signedIn>>;

async function createKhatma(
  t: T,
  who: Who,
  schedule: "weekly" | "none" | "daily" = "weekly",
  name: string | null = null,
) {
  const { inviteCode } = await t.action(api.khatmas.create, {
    sessionToken: who.token,
    name,
    schedule,
  });
  return inviteCode;
}

async function khatmaByCode(t: T, inviteCode: string) {
  return await t.run(async (ctx) => {
    const khatma = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    if (!khatma) throw new Error("no khatma");
    return khatma;
  });
}

async function memberOf(t: T, khatmaId: Id<"khatmas">, who: Who) {
  return await t.run(async (ctx) => {
    const m = await ctx.db
      .query("members")
      .withIndex("by_khatma_person", (q) =>
        q.eq("khatmaId", khatmaId).eq("personId", who.personId),
      )
      .unique();
    if (!m) throw new Error("no member");
    return m;
  });
}

async function viewAs(t: T, inviteCode: string, who: Who | null) {
  const res = await t.query(api.khatmas.view, {
    inviteCode,
    sessionToken: who?.token,
  });
  if ("notFound" in res) throw new Error("unexpected notFound");
  return res;
}

async function assignmentsOf(t: T, khatmaId: Id<"khatmas">) {
  const all = await t.run((ctx) => ctx.db.query("assignments").collect());
  return all.filter((a) => a.khatmaId === khatmaId);
}

const take = (t: T, code: string, who: Who, juz: number) =>
  t.mutation(api.pool.take, {
    sessionToken: who.token,
    inviteCode: code,
    juz,
  });
const finish = (t: T, code: string, who: Who | null) =>
  t.mutation(api.pool.finish, { sessionToken: who?.token, inviteCode: code });
const undo = (t: T, code: string, who: Who | null) =>
  t.mutation(api.pool.undoFinish, {
    sessionToken: who?.token,
    inviteCode: code,
  });
const release = (t: T, code: string, who: Who | null) =>
  t.mutation(api.pool.release, { sessionToken: who?.token, inviteCode: code });

async function setSetting(t: T, key: string, value: unknown) {
  await t.run((ctx) =>
    ctx.db.insert("settings", { key, value, updatedAt: NOW }),
  );
}

async function setup() {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  // creating a khatma runs an action, which nudges the fake clock by 1ms
  vi.setSystemTime(NOW);
  return { t, ali, code, khatma };
}

async function round1(t: T, khatmaId: Id<"khatmas">) {
  return await t.run(async (ctx) => {
    const r = await ctx.db
      .query("rounds")
      .withIndex("by_khatma_number", (q) =>
        q.eq("khatmaId", khatmaId).eq("number", 1),
      )
      .unique();
    if (!r) throw new Error("no round");
    return r;
  });
}

test("finish then undo within 10s restores the hold", async () => {
  const { t, ali, code, khatma } = await setup();
  await take(t, code, ali, 12);
  // convex-test pins each transaction's clock a hair ahead of the fake clock
  const done = await finish(t, code, ali);
  if (!done.ok) throw new Error("finish failed");
  const finishedAt = done.undoUntil - 10_000;
  expect(finishedAt).toBeGreaterThanOrEqual(NOW);
  expect(finishedAt).toBeLessThan(NOW + 100);
  let view = await viewAs(t, code, ali);
  expect(view.tiles[11]).toMatchObject({ state: "done", readerName: null });
  expect(view.me.holding).toBeNull();
  expect((await round1(t, khatma._id)).lastFinishedAt).toBe(finishedAt);

  vi.setSystemTime(NOW + 4_000);
  expect(await undo(t, code, ali)).toEqual({ ok: true });
  view = await viewAs(t, code, ali);
  expect(view.me.holding).toBe(12);
  expect(view.tiles[11]).toMatchObject({ state: "reading", isMine: true });
  expect((await round1(t, khatma._id)).lastFinishedAt).toBeNull();
  // the same row was patched, never replaced
  const rows = await assignmentsOf(t, khatma._id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ finishedAt: null, releasedAt: null });
});

test("finish patches the existing row", async () => {
  const { t, ali, code, khatma } = await setup();
  await take(t, code, ali, 3);
  const before = await assignmentsOf(t, khatma._id);
  await finish(t, code, ali);
  const after = await assignmentsOf(t, khatma._id);
  expect(after).toHaveLength(1);
  expect(after[0]?._id).toBe(before[0]?._id);
  expect(after[0]?.finishedAt).toBeGreaterThanOrEqual(NOW);
  expect(after[0]?.finishedAt).toBeLessThan(NOW + 100);
});

test("undo after 10s is rejected", async () => {
  const { t, ali, code } = await setup();
  await take(t, code, ali, 5);
  const done = await finish(t, code, ali);
  if (!done.ok) throw new Error("finish failed");
  vi.setSystemTime(done.undoUntil + 10);
  expect(await undo(t, code, ali)).toEqual({
    ok: false,
    reason: "window_closed",
  });
});

test("undo just inside 10s is allowed", async () => {
  const { t, ali, code } = await setup();
  await take(t, code, ali, 5);
  const done = await finish(t, code, ali);
  if (!done.ok) throw new Error("finish failed");
  vi.setSystemTime(done.undoUntil - 100);
  expect(await undo(t, code, ali)).toEqual({ ok: true });
});

test("undo is refused after taking another juz", async () => {
  const { t, ali, code, khatma } = await setup();
  await take(t, code, ali, 12);
  await finish(t, code, ali);
  vi.setSystemTime(NOW + 3_000);
  expect(await take(t, code, ali, 13)).toEqual({ ok: true });
  expect(await undo(t, code, ali)).toEqual({
    ok: false,
    reason: "holding_another",
  });
  const view = await viewAs(t, code, ali);
  expect(view.tiles[11]?.state).toBe("done");
  expect(view.me.holding).toBe(13);
  expect(
    (await assignmentsOf(t, khatma._id)).find((a) => a.juz === 12)?.finishedAt,
  ).not.toBeNull();
});

test("undo with nothing finished is nothing_to_undo", async () => {
  const { t, ali, code } = await setup();
  expect(await undo(t, code, ali)).toEqual({
    ok: false,
    reason: "nothing_to_undo",
  });
  await take(t, code, ali, 1);
  expect(await undo(t, code, ali)).toEqual({
    ok: false,
    reason: "nothing_to_undo",
  });
});

test("a member cannot undo someone else's finish", async () => {
  const { t, ali, code, khatma } = await setup();
  const bob = await signedIn(t, "B");
  await take(t, code, ali, 7);
  await take(t, code, bob, 8);
  await finish(t, code, ali);
  expect(await undo(t, code, bob)).toEqual({
    ok: false,
    reason: "nothing_to_undo",
  });
  expect((await viewAs(t, code, bob)).tiles[6]?.state).toBe("done");
  expect(
    (await assignmentsOf(t, khatma._id)).find((a) => a.juz === 8)?.finishedAt,
  ).toBeNull();
});

test("undo targets the most recent finish and recomputes lastFinishedAt", async () => {
  const { t, ali, code, khatma } = await setup();
  await take(t, code, ali, 1);
  await finish(t, code, ali);
  vi.setSystemTime(NOW + 2_000);
  await take(t, code, ali, 2);
  await finish(t, code, ali);
  const before = await assignmentsOf(t, khatma._id);
  const first = before.find((a) => a.juz === 1)?.finishedAt;
  const second = before.find((a) => a.juz === 2)?.finishedAt;
  expect(second).toBeGreaterThanOrEqual(NOW + 2_000);
  expect((await round1(t, khatma._id)).lastFinishedAt).toBe(second);
  expect(await undo(t, code, ali)).toEqual({ ok: true });
  const rows = await assignmentsOf(t, khatma._id);
  expect(rows.find((a) => a.juz === 2)?.finishedAt).toBeNull();
  expect(rows.find((a) => a.juz === 1)?.finishedAt).toBe(first);
  expect((await round1(t, khatma._id)).lastFinishedAt).toBe(first);
});

test("release reopens the juz without naming anyone", async () => {
  const { t, ali, code, khatma } = await setup();
  const bob = await signedIn(t, "B");
  await take(t, code, bob, 9);
  expect((await viewAs(t, code, ali)).tiles[8]).toMatchObject({
    state: "reading",
    readerName: "B",
  });
  expect(await release(t, code, bob)).toEqual({ ok: true });
  for (const who of [bob, ali, null]) {
    const view = await viewAs(t, code, who);
    expect(view.tiles[8]).toMatchObject({ state: "open", readerName: null });
  }
  expect((await viewAs(t, code, bob)).me.holding).toBeNull();
  const row = (await assignmentsOf(t, khatma._id))[0];
  expect(row).toMatchObject({
    releasedBySystem: false,
    finishedAt: null,
  });
  expect(row?.releasedAt).toBeGreaterThanOrEqual(NOW);
  // someone else can take it now
  expect(await take(t, code, ali, 9)).toEqual({ ok: true });
});

test("finish and release when not holding", async () => {
  const { t, ali, code } = await setup();
  expect(await finish(t, code, ali)).toEqual({
    ok: false,
    reason: "not_holding",
  });
  expect(await release(t, code, ali)).toEqual({
    ok: false,
    reason: "not_holding",
  });
  await take(t, code, ali, 4);
  await finish(t, code, ali);
  expect(await finish(t, code, ali)).toEqual({
    ok: false,
    reason: "not_holding",
  });
  expect(await release(t, code, ali)).toEqual({
    ok: false,
    reason: "not_holding",
  });
});

test("signed out throws not_signed_in; unknown code throws not_found", async () => {
  const { t, ali, code } = await setup();
  for (const fn of [finish, undo, release]) {
    await expect(fn(t, code, null)).rejects.toThrow(/not_signed_in/);
    await expect(fn(t, "AAAAAAAAAAAA", ali)).rejects.toThrow(/not_found/);
    await expect(fn(t, "bad", ali)).rejects.toThrow(/not_found/);
  }
});

test("blocked members get blocked from finish, undo, and release", async () => {
  const { t, ali, code, khatma } = await setup();
  await take(t, code, ali, 6);
  const member = await memberOf(t, khatma._id, ali);
  await t.run((ctx) => ctx.db.patch(member._id, { status: "blocked" }));
  for (const fn of [finish, undo, release]) {
    expect(await fn(t, code, ali)).toEqual({ ok: false, reason: "blocked" });
  }
});

test("finish, undo, and release share the pool limit with take", async () => {
  const { t, ali, code } = await setup();
  await setSetting(t, "poolActionsPerPersonPerMinute", 4);
  for (let juz = 1; juz <= 2; juz++) {
    expect(await take(t, code, ali, juz)).toEqual({ ok: true });
    expect(await finish(t, code, ali)).toMatchObject({ ok: true });
  }
  for (const fn of [finish, undo, release, undo]) {
    expect(await fn(t, code, ali)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  }
  vi.setSystemTime(NOW + 61_000);
  expect(await release(t, code, ali)).toEqual({
    ok: false,
    reason: "not_holding",
  });
});

test("finish, undo, and release refuse in maintenance without spending the bucket", async () => {
  for (const fn of [finish, undo, release]) {
    const { t, ali, code } = await setup();
    await take(t, code, ali, 1);
    const limit = await t.run((ctx) =>
      ctx.db
        .query("rateLimits")
        .withIndex("by_key", (q) => q.eq("key", `pool:${ali.personId}`))
        .unique(),
    );
    await setSetting(t, "maintenanceMode", true);
    expect(await fn(t, code, ali)).toEqual({
      ok: false,
      reason: "maintenance",
    });
    const after = await t.run((ctx) =>
      ctx.db
        .query("rateLimits")
        .withIndex("by_key", (q) => q.eq("key", `pool:${ali.personId}`))
        .unique(),
    );
    expect(after?.count).toBe(limit?.count);
    // nothing changed: still holding juz 1
    expect((await viewAs(t, code, ali)).me.holding).toBe(1);
  }
});
