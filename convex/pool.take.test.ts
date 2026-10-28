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

async function join(
  t: T,
  khatmaId: Id<"khatmas">,
  who: Who,
  opts: { status?: "active" | "blocked"; shareToken?: string } = {},
) {
  return await t.run((ctx) =>
    ctx.db.insert("members", {
      khatmaId,
      personId: who.personId,
      joinedAt: Date.now(),
      status: opts.status ?? "active",
      nudgesOn: true,
      lastCelebratedRound: 0,
      shareToken: opts.shareToken,
    }),
  );
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

/** Inserts an assignment directly: finished, released, or still being read. */
async function assign(
  t: T,
  khatmaId: Id<"khatmas">,
  who: Who,
  juz: number,
  state: "reading" | "done" | "released",
  roundNumber = 1,
) {
  const member = await memberOf(t, khatmaId, who);
  await t.run(async (ctx) => {
    const round = await ctx.db
      .query("rounds")
      .withIndex("by_khatma_number", (q) =>
        q.eq("khatmaId", khatmaId).eq("number", roundNumber),
      )
      .unique();
    if (!round) throw new Error("no round");
    await ctx.db.insert("assignments", {
      khatmaId,
      roundId: round._id,
      roundNumber,
      juz,
      memberId: member._id,
      personId: who.personId,
      takenAt: NOW,
      finishedAt: state === "done" ? NOW : null,
      releasedAt: state === "released" ? NOW : null,
      releasedBySystem: false,
    });
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

function take(t: T, code: string, who: Who | null, juz: number) {
  return t.mutation(api.pool.take, {
    sessionToken: who?.token,
    inviteCode: code,
    juz,
  });
}

/** Makes `number` the khatma's current round, inserting the rounds in between. */
async function advanceTo(t: T, khatmaId: Id<"khatmas">, number: number) {
  await t.run(async (ctx) => {
    for (let n = 2; n <= number; n++) {
      const roundId = await ctx.db.insert("rounds", {
        khatmaId,
        number: n,
        startedAt: NOW,
        targetEndAt: null,
        completedAt: n < number ? NOW : null,
        lastFinishedAt: null,
      });
      if (n === number)
        await ctx.db.patch(khatmaId, { currentRoundId: roundId });
    }
  });
}

async function assignmentsOf(t: T, khatmaId: Id<"khatmas">) {
  const all = await t.run((ctx) => ctx.db.query("assignments").collect());
  return all.filter((a) => a.khatmaId === khatmaId);
}

test("take marks the juz reading and makes the person a member", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  const bob = await signedIn(t, "B");

  expect(await take(t, code, bob, 14)).toEqual({ ok: true });

  const view = await viewAs(t, code, bob);
  expect(view.me).toMatchObject({
    isMember: true,
    holding: 14,
    suggestion: null,
  });
  expect(view.tiles[13]).toMatchObject({ state: "reading", isMine: true });
  expect(view.memberCount).toBe(2);
  const member = await memberOf(t, khatma._id, bob);
  expect(member).toMatchObject({
    status: "active",
    nudgesOn: true,
    lastCelebratedRound: 0,
  });
  expect(member.shareToken).toBeUndefined();
  const [row] = (await assignmentsOf(t, khatma._id)).filter(
    (a) => a.personId === bob.personId,
  );
  expect(row).toMatchObject({
    juz: 14,
    roundNumber: 1,
    roundId: khatma.currentRoundId,
    memberId: member._id,
    finishedAt: null,
    releasedAt: null,
    releasedBySystem: false,
  });
  expect(row?.takenAt).toBeGreaterThanOrEqual(NOW);
});

test("an existing member can take without a second membership", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  expect(await take(t, code, ali, 3)).toEqual({ ok: true });
  const members = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
      .collect(),
  );
  expect(members).toHaveLength(1);
  // the creator keeps their share token
  expect(members[0]?.shareToken).toBeTruthy();
});

test("second take while holding returns already_holding", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  expect(await take(t, code, ali, 1)).toEqual({ ok: true });
  expect(await take(t, code, ali, 2)).toEqual({
    ok: false,
    reason: "already_holding",
  });
});

test("taking a taken juz returns taken, and a new person gets no membership", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  const bob = await signedIn(t, "B");
  expect(await take(t, code, ali, 14)).toEqual({ ok: true });
  expect(await take(t, code, bob, 14)).toEqual({ ok: false, reason: "taken" });
  const view = await viewAs(t, code, bob);
  expect(view.me.isMember).toBe(false);
  expect(view.memberCount).toBe(1);
  expect(khatma._id).toBeTruthy();
});

test("a finished juz counts as taken", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await assign(t, khatma._id, ali, 5, "done");
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 5)).toEqual({ ok: false, reason: "taken" });
});

test("a released juz can be taken again", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await assign(t, khatma._id, ali, 9, "released");
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 9)).toEqual({ ok: true });
  expect((await viewAs(t, code, bob)).tiles[8]).toMatchObject({
    state: "reading",
    isMine: true,
  });
});

test("two simultaneous takes of one juz have exactly one winner", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const bob = await signedIn(t, "B");
  const cat = await signedIn(t, "C");
  const results = await Promise.all([
    take(t, code, bob, 20),
    take(t, code, cat, 20),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.filter((r) => !r.ok)).toEqual([
    { ok: false, reason: "taken" },
  ]);
});

async function fillMembers(t: T, khatmaId: Id<"khatmas">, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      const personId = await ctx.db.insert("people", {
        phone: `+9716${String(i).padStart(8, "0")}`,
        displayName: `M${i}`,
        verifiedAt: 0,
        timeZone: "Asia/Dubai",
      });
      await ctx.db.insert("members", {
        khatmaId,
        personId,
        joinedAt: NOW,
        status: "active",
        nudgesOn: true,
        lastCelebratedRound: 0,
      });
    }
  });
}

test("the 61st person gets khatma_full; an existing member can still take", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await fillMembers(t, khatma._id, 59); // plus the creator = 60
  const newcomer = await signedIn(t, "N");
  expect(await take(t, code, newcomer, 1)).toEqual({
    ok: false,
    reason: "khatma_full",
  });
  expect((await viewAs(t, code, newcomer)).me.isMember).toBe(false);
  expect(await take(t, code, ali, 1)).toEqual({ ok: true });
});

test("blocked members do not count toward the cap", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await fillMembers(t, khatma._id, 58); // 59 active
  const bad = await signedIn(t, "X");
  await join(t, khatma._id, bad, { status: "blocked" });
  const newcomer = await signedIn(t, "N");
  expect(await take(t, code, newcomer, 1)).toEqual({ ok: true });
});

test("blocked member gets blocked on take and no suggestion", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  const bob = await signedIn(t, "B");
  await join(t, khatma._id, bob, { status: "blocked" });
  expect(await take(t, code, bob, 4)).toEqual({ ok: false, reason: "blocked" });
  const view = await viewAs(t, code, bob);
  expect(view.me.isMember).toBe(false);
  expect(view.me.suggestion).toBeNull();
  // signed-out viewers and non-members still get a suggestion
  expect((await viewAs(t, code, null)).me.suggestion).toBe(1);
  const cat = await signedIn(t, "C");
  expect((await viewAs(t, code, cat)).me.suggestion).toBe(1);
});

/** Marks `juzList` finished by `who` in round `roundNumber`. */
async function finishedIn(
  t: T,
  khatmaId: Id<"khatmas">,
  who: Who,
  roundNumber: number,
  juzList: number[],
) {
  for (const juz of juzList)
    await assign(t, khatmaId, who, juz, "done", roundNumber);
}

test("rotation skips ajza' finished in the last 3 rounds", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await advanceTo(t, khatma._id, 4);
  const bob = await signedIn(t, "B");
  await join(t, khatma._id, bob);
  await finishedIn(t, khatma._id, bob, 3, [1]);
  expect((await viewAs(t, code, bob)).me.suggestion).toBe(2);
  // others are unaffected
  expect((await viewAs(t, code, ali)).me.suggestion).toBe(1);
  expect((await viewAs(t, code, null)).me.suggestion).toBe(1);
});

test("rotation counts the person's own last 3 reading rounds, not calendar rounds", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await advanceTo(t, khatma._id, 12);
  const bob = await signedIn(t, "B");
  await join(t, khatma._id, bob);
  await finishedIn(t, khatma._id, bob, 1, [1]);
  await finishedIn(t, khatma._id, bob, 5, [3]);
  await finishedIn(t, khatma._id, bob, 9, [4]);
  // rounds 1, 5, 9 are their last 3 reading rounds: 1, 3, 4 are skipped
  expect((await viewAs(t, code, bob)).me.suggestion).toBe(2);

  // a fourth reading round pushes round 1 out of the window
  await finishedIn(t, khatma._id, bob, 11, [5]);
  expect((await viewAs(t, code, bob)).me.suggestion).toBe(1);
});

test("rotation ignores unfinished and released ajza', and falls back to the lowest open", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await advanceTo(t, khatma._id, 3);
  const bob = await signedIn(t, "B");
  await join(t, khatma._id, bob);
  await assign(t, khatma._id, bob, 1, "released", 2);
  expect((await viewAs(t, code, bob)).me.suggestion).toBe(1);

  // every open juz' was finished recently: fall back to the lowest open
  await finishedIn(t, khatma._id, bob, 2, [1, 2, 3]);
  for (let juz = 4; juz <= 30; juz++) {
    await assign(t, khatma._id, ali, juz, "reading", 3);
  }
  expect((await viewAs(t, code, bob)).me.suggestion).toBe(1);
});

test("suggestion is null when nothing is open", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  const bob = await signedIn(t, "B");
  for (let juz = 1; juz <= 30; juz++) {
    await assign(t, khatma._id, ali, juz, juz % 2 ? "done" : "reading");
  }
  expect((await viewAs(t, code, bob)).me.suggestion).toBeNull();
  expect(await take(t, code, bob, 7)).toEqual({ ok: false, reason: "taken" });
});

test("a newcomer to a khatma with 5 completed rounds sees no celebration", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await advanceTo(t, khatma._id, 6);
  await t.run((ctx) => ctx.db.patch(khatma._id, { completedRounds: 5 }));
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 10)).toEqual({ ok: true });
  expect((await memberOf(t, khatma._id, bob)).lastCelebratedRound).toBe(5);
  const view = await viewAs(t, code, bob);
  expect(view.me.celebrateRound).toBeNull();
  expect(view.me.holding).toBe(10);
  // the creator, who has not celebrated, still does
  expect((await viewAs(t, code, ali)).me.celebrateRound).toBe(5);
});

test("the 11th pool action in a minute is rate_limited", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  expect(await take(t, code, ali, 1)).toEqual({ ok: true });
  for (let i = 0; i < 9; i++) {
    expect(await take(t, code, ali, 2)).toEqual({
      ok: false,
      reason: "already_holding",
    });
  }
  expect(await take(t, code, ali, 2)).toEqual({
    ok: false,
    reason: "rate_limited",
  });
  // the window resets after a minute
  vi.setSystemTime(NOW + 61_000);
  expect(await take(t, code, ali, 2)).toEqual({
    ok: false,
    reason: "already_holding",
  });
});

async function joinCount(t: T, khatmaId: Id<"khatmas">) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", `join:${khatmaId}`))
      .first();
    return row?.count ?? 0;
  });
}

test("the 31st real join in an hour is rate_limited; existing members are unaffected", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  for (let i = 0; i < 30; i++) {
    const person = await signedIn(t, `P${i}`);
    expect(await take(t, code, person, 1)).toEqual({ ok: true });
    // free juz 1 again so the next newcomer can take it
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("assignments").collect();
      for (const row of rows) {
        if (row.finishedAt === null && row.releasedAt === null) {
          await ctx.db.patch(row._id, { releasedAt: NOW });
        }
      }
    });
  }
  expect(await joinCount(t, khatma._id)).toBe(30);
  const late = await signedIn(t, "late");
  expect(await take(t, code, late, 1)).toEqual({
    ok: false,
    reason: "rate_limited",
  });
  expect((await viewAs(t, code, late)).me.isMember).toBe(false);
  // an existing member is not affected
  expect(await take(t, code, ali, 1)).toEqual({ ok: true });
  // an hour later the window has reset
  vi.setSystemTime(NOW + 3_600_001);
  expect(await take(t, code, late, 2)).toEqual({ ok: true });
});

test("a non-member's taken attempt does not consume a join slot", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  expect(await take(t, code, ali, 14)).toEqual({ ok: true });
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 14)).toEqual({ ok: false, reason: "taken" });
  expect(await joinCount(t, khatma._id)).toBe(0);
  expect(await take(t, code, bob, 15)).toEqual({ ok: true });
  expect(await joinCount(t, khatma._id)).toBe(1);
});

test("a non-member's khatma_full attempt does not consume a join slot", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await fillMembers(t, khatma._id, 59);
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 1)).toEqual({
    ok: false,
    reason: "khatma_full",
  });
  expect(await joinCount(t, khatma._id)).toBe(0);
});

test("a join over the hourly limit is rate_limited and creates nothing", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  const khatma = await khatmaByCode(t, code);
  await t.run((ctx) =>
    ctx.db.insert("rateLimits", {
      key: `join:${khatma._id}`,
      windowStart: NOW,
      expiresAt: NOW + 3_600_000,
      count: 30,
    }),
  );
  const bob = await signedIn(t, "B");
  expect(await take(t, code, bob, 1)).toEqual({
    ok: false,
    reason: "rate_limited",
  });
  expect((await viewAs(t, code, bob)).me.isMember).toBe(false);
  expect(await joinCount(t, khatma._id)).toBe(30);
  // existing members are not affected
  expect(await take(t, code, ali, 1)).toEqual({ ok: true });
});

test("juz outside 1..30 is rejected", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  for (const juz of [31, 0, -1, 1.5, Number.NaN]) {
    await expect(take(t, code, ali, juz)).rejects.toThrow(/invalid_juz/);
  }
});

test("take requires a session and a known khatma", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  await expect(take(t, code, null, 1)).rejects.toThrow(/not_signed_in/);
  await expect(take(t, "short", ali, 1)).rejects.toThrow(/not_found/);
  await expect(take(t, "AAAAAAAAAAAA", ali, 1)).rejects.toThrow(/not_found/);
});

test("take returns maintenance in maintenance mode", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedIn(t, "A");
  const code = await createKhatma(t, ali);
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "maintenanceMode",
      value: true,
      updatedAt: NOW,
    }),
  );
  expect(await take(t, code, ali, 1)).toEqual({
    ok: false,
    reason: "maintenance",
  });
});
