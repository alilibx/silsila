import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// 2027-01-15 11:00 in Asia/Dubai (a Friday); the khatma's first day is today.
const NOW = Date.UTC(2027, 0, 15, 7, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

let seq = 0;

async function person(t: T, name = "المنظم") {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000300${String(seq).padStart(2, "0")}`,
      displayName: name,
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: NOW,
      rotaAllowed: true,
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
  return { personId, token };
}

/** A weekly (Fridays) rota khatma whose first day, today, has started. */
async function setup(t: T) {
  const who = await person(t);
  const { inviteCode } = await t.action(api.rota.create, {
    sessionToken: who.token,
    name: "ختمة",
    days: { kind: "weekly", weekdays: [5], everyWeeks: 1 },
    firstDate: "2027-01-15",
    endDate: null,
  });
  const khatmaId = await t.run(async (ctx) => {
    const k = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .first();
    return k!._id;
  });
  return { ...who, inviteCode, khatmaId };
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function startDay(t: T, s: Setup) {
  await t.mutation(internal.rotaDays.tick, { khatmaId: s.khatmaId });
}

let phoneSeq = 0;
async function add(t: T, s: Setup, juz?: number) {
  phoneSeq += 1;
  const r = await t.mutation(api.rota.addParticipant, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
    name: `قارئ ${phoneSeq}`,
    phone: `+97150666${String(phoneSeq).padStart(4, "0")}`,
    ...(juz === undefined ? {} : { juz }),
  });
  if (!("participantId" in r)) throw new Error(JSON.stringify(r));
  return r.participantId;
}

function today(t: T, s: Setup, token = s.token) {
  return t.query(api.rota.today, {
    sessionToken: token,
    inviteCode: s.inviteCode,
  });
}

async function tile(t: T, s: Setup, juz: number) {
  const view = await today(t, s);
  const found = view?.tiles.find((x) => x.juz === juz);
  if (!found) throw new Error(`no tile for juz ${juz}`);
  return found;
}

type Outcome =
  | { ok: true; completed?: boolean }
  | { error: "not_found" | "closed" | "done" };

/** Calls one of the organizer's actions; every action's arguments are plain ids. */
function act(
  t: T,
  s: Setup,
  name: "reassign" | "markDone" | "markNotDone",
  args: { readId: Id<"rotaReads">; participantId?: Id<"rotaParticipants"> },
  token = s.token,
): Promise<Outcome> {
  return t.mutation(api.rota[name], {
    sessionToken: token,
    inviteCode: s.inviteCode,
    ...args,
  } as {
    sessionToken: string;
    inviteCode: string;
    readId: Id<"rotaReads">;
    participantId: Id<"rotaParticipants">;
  }) as Promise<Outcome>;
}

function closeDay(t: T, s: Setup) {
  return t.run(async (ctx) => {
    const day = await ctx.db
      .query("rotaDays")
      .withIndex("by_khatma_n", (q) => q.eq("khatmaId", s.khatmaId))
      .first();
    await ctx.db.patch(day!._id, { closedAt: NOW });
  });
}

test("shows 30 unread tiles, the day and the next one after a start", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await add(t, s); // takes the first free juz' of the next day
  expect((await today(t, s))?.day).toBeNull();

  await startDay(t, s);
  const view = await today(t, s);
  expect(view?.day).toMatchObject({
    number: 1,
    cycle: 1,
    date: "2027-01-15",
    doneCount: 0,
    completedAt: null,
  });
  expect(view?.next).toEqual({ number: 2, date: "2027-01-22" });
  expect(view?.paused).toBe(false);
  expect(view?.archived).toBe(false);
  expect(view?.tiles).toHaveLength(30);
  expect(view?.tiles.map((x) => x.juz)).toEqual(
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  expect(view?.tiles.every((x) => x.state === "unread")).toBe(true);
  expect(view?.participants.map((p) => p.isMe)).toEqual([true, false]);
  expect(view?.participants.every((p) => !p.doneToday)).toBe(true);
});

test("reassigning juz' 8 shows it reassigned with both names", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const holder = await add(t, s, 8);
  const reader = await add(t, s, 9);
  await startDay(t, s);
  const before = await tile(t, s, 8);
  expect(before).toMatchObject({ state: "unread", readerId: holder });

  expect(
    await act(t, s, "reassign", {
      readId: before.readId,
      participantId: reader,
    }),
  ).toEqual({ ok: true });
  const after = await tile(t, s, 8);
  expect(after.state).toBe("reassigned");
  expect(after.readerId).toBe(reader);
  expect(after.holderName).toBe(before.readerName);
  expect(after.readerName).toBe((await tile(t, s, 9)).readerName);
  expect(after.holderName).not.toBe(after.readerName);
});

test("the organizer can take a juz' themselves", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const other = await add(t, s, 8);
  await startDay(t, s);
  const eight = await tile(t, s, 8);
  expect(eight.state).toBe("unread");
  expect(eight.readerId).toBe(other);

  const me = (await today(t, s))!.participants.find((p) => p.isMe)!;
  expect(
    await act(t, s, "reassign", { readId: eight.readId, participantId: me.id }),
  ).toEqual({ ok: true });
  const after = await tile(t, s, 8);
  expect(after.state).toBe("reassigned");
  expect(after.readerId).toBe(me.id);
  expect(after.readerName).toBe("المنظم");
  expect(after.holderName).toMatch(/^قارئ/);
  const row = await t.run((ctx) => ctx.db.get(eight.readId));
  expect(row?.reassignedAt).toBeGreaterThanOrEqual(NOW);
});

test("reassigning a done juz', a stranger or a missing read is refused", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const other = await add(t, s, 8);
  await startDay(t, s);
  const eight = await tile(t, s, 8);
  await act(t, s, "markDone", { readId: eight.readId });
  expect(
    await act(t, s, "reassign", { readId: eight.readId, participantId: other }),
  ).toEqual({ error: "done" });

  const nine = await tile(t, s, 9);
  const elsewhere = await t.run(async (ctx) => {
    const { _id, _creationTime, ...k } = (await ctx.db.get(s.khatmaId))!;
    void _id;
    void _creationTime;
    const id = await ctx.db.insert("khatmas", { ...k, inviteCode: "other" });
    return await ctx.db.insert("rotaParticipants", {
      khatmaId: id,
      name: "غريب",
      phone: "+971500000099",
      personId: null,
      addedAt: 0,
      removedAt: null,
    });
  });
  expect(
    await act(t, s, "reassign", {
      readId: nine.readId,
      participantId: elsewhere,
    }),
  ).toEqual({ error: "not_found" });
});

test("marking all 30 done completes the day once; marking one not done undoes it", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await startDay(t, s);
  const tiles = (await today(t, s))!.tiles;
  const results: unknown[] = [];
  for (const x of tiles) {
    results.push(await act(t, s, "markDone", { readId: x.readId }));
  }
  expect(
    results.filter((r) => (r as { completed?: boolean }).completed),
  ).toHaveLength(1);
  expect((results[29] as { completed: boolean }).completed).toBe(true);

  const done = await today(t, s);
  expect(done?.day?.doneCount).toBe(30);
  expect(done?.day?.completedAt).toBeGreaterThanOrEqual(NOW);
  expect(done?.tiles.every((x) => x.state === "done")).toBe(true);
  expect(done?.participants.every((p) => p.doneToday)).toBe(true);
  const row = await t.run((ctx) => ctx.db.get(tiles[0]!.readId));
  expect(row?.doneByOrganizer).toBe(true);

  const mine = tiles.find((x) => x.readerId !== null)!;
  expect(await act(t, s, "markNotDone", { readId: mine.readId })).toEqual({
    ok: true,
  });
  const undone = await today(t, s);
  expect(undone?.day?.doneCount).toBe(29);
  expect(undone?.day?.completedAt).toBeNull();
  expect((await tile(t, s, mine.juz)).state).toBe("unread");
  expect(undone?.participants.every((p) => p.doneToday)).toBe(false);

  expect(await act(t, s, "markDone", { readId: mine.readId })).toEqual({
    ok: true,
    completed: true,
  });
});

test("actions on a closed day return closed", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const other = await add(t, s, 8);
  await startDay(t, s);
  const eight = await tile(t, s, 8);
  await closeDay(t, s);
  expect(await act(t, s, "markDone", { readId: eight.readId })).toEqual({
    error: "closed",
  });
  expect(await act(t, s, "markNotDone", { readId: eight.readId })).toEqual({
    error: "closed",
  });
  expect(
    await act(t, s, "reassign", { readId: eight.readId, participantId: other }),
  ).toEqual({ error: "closed" });
  // Today's closed day still shows.
  expect((await today(t, s))?.day?.number).toBe(1);
});

test("a read that does not exist is not_found", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await startDay(t, s);
  const readId = (await tile(t, s, 1)).readId;
  await t.run((ctx) => ctx.db.delete(readId));
  expect(await act(t, s, "markDone", { readId })).toEqual({
    error: "not_found",
  });
  expect(await act(t, s, "markNotDone", { readId })).toEqual({
    error: "not_found",
  });
});

test("a non-organizer gets null and forbidden", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await startDay(t, s);
  const readId = (await tile(t, s, 1)).readId;
  const stranger = await person(t, "غريب");
  const participantId = (await today(t, s))!.participants[0]!.id;
  expect(await today(t, s, stranger.token)).toBeNull();
  for (const [name, args] of [
    ["markDone", { readId }],
    ["markNotDone", { readId }],
    ["reassign", { readId, participantId }],
  ] as const) {
    await expect(act(t, s, name, args, stranger.token)).rejects.toThrow(
      /forbidden/,
    );
  }
});
