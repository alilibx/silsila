import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import { slotFor } from "./lib/rota";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// 2027-01-15 11:00 in Asia/Dubai (a Friday).
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

async function person(t: T, rotaAllowed = true) {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000200${String(seq).padStart(2, "0")}`,
      displayName: "المنظم",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: NOW,
      ...(rotaAllowed ? { rotaAllowed: true } : {}),
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

async function setup(t: T) {
  const who = await person(t);
  const { inviteCode } = await t.action(api.rota.create, {
    sessionToken: who.token,
    name: "ختمة",
    days: { kind: "weekly", weekdays: [5], everyWeeks: 1 },
    firstDate: "2027-01-15",
    endDate: null,
  });
  return { ...who, inviteCode };
}
type Setup = Awaited<ReturnType<typeof setup>>;

let phoneSeq = 0;
function add(
  t: T,
  s: Setup,
  over: Partial<{ name: string; phone: string; juz: number }> = {},
) {
  phoneSeq += 1;
  return t.mutation(api.rota.addParticipant, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
    name: `قارئ ${phoneSeq}`,
    phone: `+97150555${String(phoneSeq).padStart(4, "0")}`,
    ...over,
  });
}

function people(t: T, s: Setup) {
  return t.query(api.rota.people, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
  });
}

function participantId(r: Awaited<ReturnType<typeof add>>) {
  if (!("participantId" in r)) throw new Error(JSON.stringify(r));
  return r.participantId;
}

test("the first people added take the lowest free ajza' in order", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const a = await add(t, s, { name: "الأول" });
  const b = await add(t, s);
  const c = await add(t, s);
  expect([a, b, c].map((r) => ("juz" in r ? r.juz : null))).toEqual([2, 3, 4]);

  const view = await people(t, s);
  expect(view?.target).toEqual({
    number: 1,
    date: "2027-01-15",
    isFirst: true,
  });
  expect(view?.rows).toHaveLength(30);
  expect(view?.rows[0]?.participant).toMatchObject({
    name: "المنظم",
    isMe: true,
    slots: 1,
  });
  expect(view?.rows[1]?.juz).toBe(2);
  expect(view?.rows[1]?.participant?.name).toBe("الأول");
  expect(view?.rows[4]?.participant).toBeNull();
  expect(view?.freeJuz).toHaveLength(26);
  expect(view?.freeJuz[0]).toBe(5);
  expect(view?.maxSlots).toBe(3);
  expect(view?.participants.map((p) => p.juz)).toEqual([[1], [2], [3], [4]]);
});

test("refuses a held juz', a repeated phone, a bad name or phone", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await add(t, s, { juz: 5, phone: "+971505550001" });
  expect(await add(t, s, { juz: 5 })).toEqual({ error: "juz_taken" });
  expect(await add(t, s, { phone: "+971 50 555 0001" })).toEqual({
    error: "already_added",
  });
  expect(await add(t, s, { phone: "0505550002" })).toEqual({
    error: "bad_phone",
  });
  expect(await add(t, s, { name: "  " })).toEqual({ error: "bad_name" });
});

test("says when no juz' is free", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  for (let i = 0; i < 29; i++) await add(t, s);
  expect(await add(t, s)).toEqual({ error: "no_free_juz" });
});

test("giveJuz gives up to the slot limit, then too_many", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const id = participantId(await add(t, s)); // juz' 2
  const give = (juz: number) =>
    t.mutation(api.rota.giveJuz, {
      sessionToken: s.token,
      inviteCode: s.inviteCode,
      participantId: id,
      juz,
    });
  expect(await give(10)).toEqual({ ok: true });
  expect(await give(11)).toEqual({ ok: true });
  expect(await give(12)).toEqual({ error: "too_many" });
  expect(await give(1)).toEqual({ error: "juz_taken" });
  const view = await people(t, s);
  expect(view?.participants.find((p) => p.id === id)?.juz).toEqual([2, 10, 11]);
});

test("moveJuz moves to a free juz' and swaps with a held one", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const a = participantId(await add(t, s)); // 2
  const b = participantId(await add(t, s)); // 3
  const move = (
    participant: Id<"rotaParticipants">,
    from: number,
    to: number,
  ) =>
    t.mutation(api.rota.moveJuz, {
      sessionToken: s.token,
      inviteCode: s.inviteCode,
      participantId: participant,
      fromJuz: from,
      toJuz: to,
    });
  expect(await move(a, 2, 20)).toEqual({ ok: true });
  let view = await people(t, s);
  expect(view?.rows[19]?.participant?.id).toBe(a);
  expect(view?.rows[1]?.participant).toBeNull();

  expect(await move(a, 20, 3)).toEqual({ ok: true });
  view = await people(t, s);
  expect(view?.rows[2]?.participant?.id).toBe(a);
  expect(view?.rows[19]?.participant?.id).toBe(b);

  expect(await move(a, 20, 5)).toEqual({ error: "not_found" });
});

test("freeJuz empties a slot", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await add(t, s);
  const free = (juz: number) =>
    t.mutation(api.rota.freeJuz, {
      sessionToken: s.token,
      inviteCode: s.inviteCode,
      juz,
    });
  expect(await free(2)).toEqual({ ok: true });
  expect(await free(2)).toEqual({ error: "not_found" });
  const view = await people(t, s);
  expect(view?.rows[1]?.participant).toBeNull();
  expect(view?.freeJuz).toContain(2);
});

test("removeParticipant frees their ajza' and refuses the organizer", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const a = participantId(await add(t, s));
  await t.mutation(api.rota.giveJuz, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
    participantId: a,
    juz: 9,
  });
  const remove = (id: Id<"rotaParticipants">) =>
    t.mutation(api.rota.removeParticipant, {
      sessionToken: s.token,
      inviteCode: s.inviteCode,
      participantId: id,
    });
  expect(await remove(a)).toEqual({ ok: true });
  const view = await people(t, s);
  expect(view?.participants.map((p) => p.name)).toEqual(["المنظم"]);
  expect(view?.freeJuz).toEqual(expect.arrayContaining([2, 9]));
  expect(await remove(a)).toEqual({ error: "not_found" });

  const me = view!.participants[0]!.id;
  expect(await remove(me)).toEqual({ error: "is_me" });

  // a removed person can be added again
  expect(await add(t, s, { phone: "+971505550099" })).toMatchObject({
    ok: true,
  });
});

test("someone else sees no people and cannot change them", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const a = participantId(await add(t, s));
  const other = await person(t);
  const args = { sessionToken: other.token, inviteCode: s.inviteCode };
  expect(await t.query(api.rota.people, args)).toBeNull();
  expect(
    await t.query(api.rota.people, { inviteCode: s.inviteCode }),
  ).toBeNull();
  const forbidden = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as { data?: { code?: string } }).data?.code;
    }
  };
  expect(
    await forbidden(
      t.mutation(api.rota.addParticipant, {
        ...args,
        name: "س",
        phone: "+971505559999",
      }),
    ),
  ).toBe("forbidden");
  expect(
    await forbidden(
      t.mutation(api.rota.giveJuz, { ...args, participantId: a, juz: 8 }),
    ),
  ).toBe("forbidden");
  expect(
    await forbidden(
      t.mutation(api.rota.moveJuz, {
        ...args,
        participantId: a,
        fromJuz: 2,
        toJuz: 8,
      }),
    ),
  ).toBe("forbidden");
  expect(
    await forbidden(t.mutation(api.rota.freeJuz, { ...args, juz: 2 })),
  ).toBe("forbidden");
  expect(
    await forbidden(
      t.mutation(api.rota.removeParticipant, { ...args, participantId: a }),
    ),
  ).toBe("forbidden");
});

test("a pool khatma is not a rota khatma", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await t.run(async (ctx) => {
    const k = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", s.inviteCode))
      .unique();
    await ctx.db.patch(k!._id, { kind: undefined, rota: undefined });
  });
  expect(await people(t, s)).toBeNull();
});

test("once day 12 has started, new people join khatma 13 and day 12 keeps its readers", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const { khatmaId, readId, firstId } = await t.run(async (ctx) => {
    const k = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", s.inviteCode))
      .unique();
    const khatmaId = k!._id;
    const first = await ctx.db
      .query("rotaParticipants")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatmaId))
      .first();
    const dayId = await ctx.db.insert("rotaDays", {
      khatmaId,
      n: 12,
      number: 12,
      cycle: 1,
      date: "2027-01-15",
      startedAt: NOW - 3_600_000,
      closesAt: NOW + 3_600_000,
      completedAt: null,
      closedAt: null,
      unreadSentAt: null,
      summarySentAt: null,
    });
    let readId: Id<"rotaReads"> | null = null;
    for (let juz = 1; juz <= 30; juz++) {
      const id = await ctx.db.insert("rotaReads", {
        dayId,
        khatmaId,
        juz,
        slot: slotFor(juz, 12),
        holderId: juz === 7 ? first!._id : null,
        readerId: juz === 7 ? first!._id : null,
        doneAt: null,
        doneByOrganizer: false,
        reassignedAt: null,
      });
      if (juz === 7) readId = id;
    }
    return { khatmaId, readId: readId!, firstId: first!._id };
  });

  const before = await people(t, s);
  // the next day is the 13th; the 15th is taken by day 12, so the next Friday
  expect(before?.target).toEqual({
    number: 13,
    date: "2027-01-22",
    isFirst: false,
  });

  const r = await add(t, s, { juz: 7 });
  expect(r).toMatchObject({ ok: true, juz: 7 });
  await t.run(async (ctx) => {
    const slots = await ctx.db
      .query("rotaSlots")
      .withIndex("by_khatma_slot", (q) =>
        q.eq("khatmaId", khatmaId).eq("slot", slotFor(7, 13)),
      )
      .collect();
    expect(slots).toHaveLength(1);
    expect(slots[0]?.participantId).toBe(participantId(r));
    const read = await ctx.db.get(readId);
    expect(read?.readerId).not.toBe(participantId(r));
    expect(read?.readerId).toBe(firstId);
  });
});

test("there is no next day to place people on once the end date has passed", async () => {
  const t = convexTest(schema, modules);
  const who = await person(t);
  const { inviteCode } = await t.action(api.rota.create, {
    sessionToken: who.token,
    name: "ختمة",
    days: { kind: "weekly", weekdays: [5], everyWeeks: 1 },
    firstDate: "2027-01-15",
    endDate: "2027-01-15",
  });
  const s = { ...who, inviteCode };
  expect((await people(t, s))?.target.date).toBe("2027-01-15");

  await t.run(async (ctx) => {
    const k = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    await ctx.db.insert("rotaDays", {
      khatmaId: k!._id,
      n: 1,
      number: 1,
      cycle: 1,
      date: "2027-01-15",
      startedAt: NOW - 3_600_000,
      closesAt: NOW + 3_600_000,
      completedAt: null,
      closedAt: null,
      unreadSentAt: null,
      summarySentAt: null,
    });
  });
  expect((await people(t, s))?.target).toEqual({
    number: 2,
    date: null,
    isFirst: false,
  });
});
