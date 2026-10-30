import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { DEFAULT_GRACE } from "./lib/grace";
import type { RotaMessages } from "./lib/rota";
import { celebrateIfComplete } from "./rotaDays";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type T = TestConvexForDataModel<DataModel>;

/** A wall-clock time in Asia/Dubai (+04:00, no DST), written `YYYY-MM-DDTHH:MM`. */
function dubai(local: string): number {
  return Date.parse(`${local}:00+04:00`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(dubai("2027-01-15T12:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

const MESSAGES: RotaMessages = {
  dayAt: 480,
  reminder: { at: 960, on: true },
  unread: { at: 1140, on: false },
  summary: { at: 1260, on: false },
};

type Reader = {
  slot: number;
  /** Their join message; null for someone who never joined. Default 0 (long ago). */
  joinedAt?: number | null;
  stoppedAt?: number | null;
  silencedAt?: number | null;
};

/** A daily rota khatma, first date 2027-01-16, with a joined participant per entry of `readers`. */
async function setup(
  t: T,
  readers: Reader[],
  over: { messages?: RotaMessages; firstDate?: string } = {},
) {
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: "+971500000001",
      displayName: "المنظم",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
      rotaAllowed: true,
    });
    const khatmaId = await ctx.db.insert("khatmas", {
      name: "ختمة",
      schedule: "none",
      grace: DEFAULT_GRACE.none,
      creatorPersonId: personId,
      inviteCode: "code",
      completedRounds: 0,
      createdAt: 0,
      kind: "rota",
      rota: {
        days: { kind: "daily" },
        firstDate: over.firstDate ?? "2027-01-16",
        endDate: null,
        timeZone: "Asia/Dubai",
        messages: over.messages ?? MESSAGES,
        pausedAt: null,
        pauseDates: [],
        archivedAt: null,
      },
    });
    await ctx.db.insert("members", {
      khatmaId,
      personId,
      joinedAt: 0,
      shareToken: "share",
      status: "active",
      notificationsOn: true,
      lastNudgeAt: null,
      lastCelebratedRound: 0,
    });
    const participants: Id<"rotaParticipants">[] = [];
    for (const [i, r] of readers.entries()) {
      const participantId = await ctx.db.insert("rotaParticipants", {
        khatmaId,
        name: `قارئ ${i + 1}`,
        phone: `+97150000010${i}`,
        personId: null,
        addedAt: 0,
        removedAt: null,
        joinedAt: r.joinedAt === undefined ? 0 : r.joinedAt,
        stoppedAt: r.stoppedAt ?? null,
        silencedAt: r.silencedAt ?? null,
      });
      await ctx.db.insert("rotaSlots", {
        khatmaId,
        slot: r.slot,
        participantId,
      });
      participants.push(participantId);
    }
    return { personId, khatmaId, participants };
  });
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function tickAt(t: T, s: Setup, local: string) {
  vi.setSystemTime(dubai(local));
  await t.mutation(internal.rotaDays.tick, { khatmaId: s.khatmaId });
}

function outbox(t: T, kind?: string) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("rotaOutbox").collect();
    return rows
      .filter((r) => kind === undefined || r.kind === kind)
      .map((r) => ({
        participantId: r.participantId,
        kind: r.kind,
        juz: r.juz,
        number: r.number,
        dayId: r.dayId,
      }));
  });
}

function readsOf(t: T, dayId: Id<"rotaDays">) {
  return t.run((ctx) =>
    ctx.db
      .query("rotaReads")
      .withIndex("by_day_juz", (q) => q.eq("dayId", dayId))
      .collect(),
  );
}

function firstDay(t: T, s: Setup) {
  return t.run(async (ctx) => {
    const day = await ctx.db
      .query("rotaDays")
      .withIndex("by_khatma_n", (q) => q.eq("khatmaId", s.khatmaId))
      .first();
    return day!;
  });
}

function participant(t: T, id: Id<"rotaParticipants">) {
  return t.run(async (ctx) => (await ctx.db.get(id))!);
}

function organizerNotes(t: T, s: Setup, kind: string) {
  return t.run(async (ctx) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_person_khatma", (q) =>
        q.eq("personId", s.personId).eq("khatmaId", s.khatmaId),
      )
      .collect();
    return notes.filter((n) => n.kind === kind);
  });
}

test("a started day queues one juz' message for a joined two-slot reader and none for one who never joined", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [
    { slot: 2 },
    { slot: 3 },
    { slot: 4, joinedAt: null },
  ]);
  await tickAt(t, s, "2027-01-16T08:00");
  const day = await firstDay(t, s);
  expect(await outbox(t)).toEqual([
    {
      participantId: s.participants[0],
      kind: "juz",
      juz: [2],
      number: 1,
      dayId: day._id,
    },
    {
      participantId: s.participants[1],
      kind: "juz",
      juz: [3],
      number: 1,
      dayId: day._id,
    },
  ]);
});

test("one reader holding two slots gets all their ajza' in one message", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }, { slot: 6 }]);
  // The same person on a second slot.
  const [first] = s.participants;
  await t.run((ctx) =>
    ctx.db.insert("rotaSlots", {
      khatmaId: s.khatmaId,
      slot: 7,
      participantId: first!,
    }),
  );
  await tickAt(t, s, "2027-01-16T08:00");
  const rows = await outbox(t, "juz");
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.participantId === s.participants[0])?.juz).toEqual([
    2, 7,
  ]);
});

test("the reminder goes once, only to readers with unread ajza'", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }, { slot: 3 }, { slot: 4 }]);
  await tickAt(t, s, "2027-01-16T08:00");
  const day = await firstDay(t, s);
  for (const r of await readsOf(t, day._id)) {
    if (r.juz === 3) await t.run((ctx) => ctx.db.patch(r._id, { doneAt: 1 }));
    if (r.juz === 4) await t.run((ctx) => ctx.db.patch(r._id, { notYetAt: 1 }));
  }

  await tickAt(t, s, "2027-01-16T15:59");
  expect(await outbox(t, "reminder")).toEqual([]);

  await tickAt(t, s, "2027-01-16T16:00");
  const reminders = await outbox(t, "reminder");
  expect(reminders.map((r) => [r.participantId, r.juz, r.number])).toEqual([
    [s.participants[0], [2], 1],
    [s.participants[2], [4], 1],
  ]);
  expect((await firstDay(t, s)).reminderSentAt).toBe(dubai("2027-01-16T16:00"));

  await tickAt(t, s, "2027-01-16T17:00");
  expect(await outbox(t, "reminder")).toHaveLength(2);
});

test("no reminder when it is off", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }], {
    messages: { ...MESSAGES, reminder: { at: 960, on: false } },
  });
  await tickAt(t, s, "2027-01-16T08:00");
  await tickAt(t, s, "2027-01-16T17:00");
  expect(await outbox(t, "reminder")).toEqual([]);
});

test("no reminder while the khatma is paused", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  await tickAt(t, s, "2027-01-16T08:00");
  await t.run(async (ctx) => {
    const k = await ctx.db.get(s.khatmaId);
    await ctx.db.patch(s.khatmaId, { rota: { ...k!.rota!, pausedAt: 1 } });
  });
  await tickAt(t, s, "2027-01-16T17:00");
  expect(await outbox(t, "reminder")).toEqual([]);
});

test("a reply since the day began resets the silent days; a double tick counts a day once", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  const [id] = s.participants;
  await tickAt(t, s, "2027-01-16T08:00");
  await tickAt(t, s, "2027-01-17T08:00"); // closes day 1
  await tickAt(t, s, "2027-01-17T08:00");
  expect((await participant(t, id!)).silentDays).toBe(1);

  await tickAt(t, s, "2027-01-18T08:00"); // closes day 2
  expect((await participant(t, id!)).silentDays).toBe(2);

  // A reply during day 3, so closing it resets the count.
  await t.run((ctx) =>
    ctx.db.patch(id!, { lastReplyAt: dubai("2027-01-18T10:00") }),
  );
  await tickAt(t, s, "2027-01-19T08:00");
  expect((await participant(t, id!)).silentDays).toBe(0);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(0);
});

test("3 silent days notify the organizer once and 7 silence the participant", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  const [id] = s.participants;
  await tickAt(t, s, "2027-01-16T08:00");
  for (const d of ["17", "18", "19", "20", "21", "22"]) {
    await tickAt(t, s, `2027-01-${d}T08:00`);
  }
  const p = await participant(t, id!);
  expect(p.silentDays).toBe(6);
  expect(p.silencedAt ?? null).toBeNull();
  const silent = await organizerNotes(t, s, "rotaSilent");
  expect(silent).toHaveLength(1);
  expect(silent[0]).toMatchObject({ name: "قارئ 1", count: 3 });
  expect(await organizerNotes(t, s, "rotaSilenced")).toHaveLength(0);

  await tickAt(t, s, "2027-01-23T08:00");
  const silenced = await participant(t, id!);
  expect(silenced.silentDays).toBe(7);
  expect(silenced.silencedAt).toBe(dubai("2027-01-23T08:00"));
  expect(await organizerNotes(t, s, "rotaSilenced")).toHaveLength(1);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(1);

  // No more silent days are counted for someone already silenced.
  await tickAt(t, s, "2027-01-24T08:00");
  expect((await participant(t, id!)).silentDays).toBe(7);
  expect(await organizerNotes(t, s, "rotaSilenced")).toHaveLength(1);
});

test("a day counts as silent only for a participant who held a read and had joined before it began", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [
    { slot: 2 },
    { slot: 3, joinedAt: dubai("2027-01-16T10:00") },
    { slot: 4, joinedAt: null },
    { slot: 5, stoppedAt: 1 },
  ]);
  // The first reader's only read on day 1 moves to the late joiner: no read, no silent day.
  const [reader, late, never, stopped] = s.participants;
  await tickAt(t, s, "2027-01-16T08:00");
  const day = await firstDay(t, s);
  for (const r of await readsOf(t, day._id)) {
    if (r.juz === 2) {
      await t.run((ctx) => ctx.db.patch(r._id, { readerId: late }));
    }
  }
  await tickAt(t, s, "2027-01-17T08:00"); // closes day 1
  expect((await participant(t, reader!)).silentDays ?? 0).toBe(0);
  // Joined after day 1 began: day 1 doesn't count against them.
  expect((await participant(t, late!)).silentDays ?? 0).toBe(0);
  expect((await participant(t, never!)).silentDays ?? 0).toBe(0);
  expect((await participant(t, stopped!)).silentDays ?? 0).toBe(0);

  await tickAt(t, s, "2027-01-18T08:00"); // closes day 2
  expect((await participant(t, reader!)).silentDays).toBe(1);
  expect((await participant(t, late!)).silentDays).toBe(1);
  expect((await participant(t, never!)).silentDays ?? 0).toBe(0);
  expect((await participant(t, stopped!)).silentDays ?? 0).toBe(0);
});

test("closing a number-30 day queues the cycle message for readers who held a slot all cycle", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(
    t,
    [
      { slot: 2 }, // joined before the cycle began, held both ends
      { slot: 3, joinedAt: dubai("2027-01-10T00:00") }, // joined after the cycle began
      { slot: 4 }, // joined early but held nothing on day 30
    ],
    { firstDate: "2027-01-01" },
  );
  const [whole, late, early] = s.participants;
  const ids = await t.run(async (ctx) => {
    const day = async (n: number, date: string, closed: boolean) =>
      ctx.db.insert("rotaDays", {
        khatmaId: s.khatmaId,
        n,
        number: n,
        cycle: 1,
        date,
        startedAt: dubai(`${date}T08:00`),
        closesAt: dubai(`${date}T08:00`) + 24 * 3_600_000,
        completedAt: null,
        closedAt: closed ? 1 : null,
        unreadSentAt: null,
        summarySentAt: null,
      });
    const first = await day(1, "2027-01-01", true);
    const last = await day(30, "2027-01-15", false);
    const read = (
      dayId: Id<"rotaDays">,
      juz: number,
      holderId: Id<"rotaParticipants">,
    ) =>
      ctx.db.insert("rotaReads", {
        dayId,
        khatmaId: s.khatmaId,
        juz,
        slot: juz,
        holderId,
        readerId: holderId,
        doneAt: null,
        doneByOrganizer: false,
        reassignedAt: null,
      });
    await read(first, 2, whole!);
    await read(first, 3, late!);
    await read(first, 4, early!);
    await read(last, 2, whole!);
    await read(last, 3, late!);
    return { last };
  });

  await tickAt(t, s, "2027-01-15T07:00"); // not yet due
  expect(await outbox(t, "cycle")).toEqual([]);
  await tickAt(t, s, "2027-01-16T08:00");
  expect(await outbox(t, "cycle")).toEqual([
    {
      participantId: whole,
      kind: "cycle",
      juz: [],
      number: 30,
      dayId: ids.last,
    },
  ]);
  await tickAt(t, s, "2027-01-16T09:00");
  expect(await outbox(t, "cycle")).toHaveLength(1);
});

test("the day that ends the khatma on number 30 still sends its cycle thank-you", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }], { firstDate: "2027-01-01" });
  const [reader] = s.participants;
  await t.run(async (ctx) => {
    const khatma = await ctx.db.get(s.khatmaId);
    if (!khatma?.rota) throw new Error("bad fixture");
    await ctx.db.patch(s.khatmaId, {
      rota: { ...khatma.rota, endDate: "2027-01-15" },
    });
    const day = async (n: number, date: string, closed: boolean) => {
      const dayId = await ctx.db.insert("rotaDays", {
        khatmaId: s.khatmaId,
        n,
        number: n,
        cycle: 1,
        date,
        startedAt: dubai(`${date}T08:00`),
        closesAt: dubai(`${date}T08:00`) + 24 * 3_600_000,
        completedAt: null,
        closedAt: closed ? 1 : null,
        unreadSentAt: null,
        summarySentAt: null,
      });
      await ctx.db.insert("rotaReads", {
        dayId,
        khatmaId: s.khatmaId,
        juz: 2,
        slot: 2,
        holderId: reader!,
        readerId: reader!,
        doneAt: null,
        doneByOrganizer: false,
        reassignedAt: null,
      });
    };
    await day(1, "2027-01-01", true);
    await day(30, "2027-01-15", false);
  });

  await tickAt(t, s, "2027-01-16T08:00");

  const khatma = await t.run((ctx) => ctx.db.get(s.khatmaId));
  expect(khatma?.rota?.archivedAt).toBe(dubai("2027-01-16T08:00"));
  const rows = await t.run((ctx) => ctx.db.query("rotaOutbox").collect());
  const cycle = rows.filter((r) => r.kind === "cycle");
  expect(cycle).toHaveLength(1);
  expect(cycle[0]).toMatchObject({ sentAt: null, skippedAt: null });
  expect(
    await t.query(internal.rotaOutbox.plan, { outboxId: cycle[0]!._id }),
  ).not.toBeNull();
});

test("celebrateIfComplete leaves out the participant who gets the dua in a reply, and only runs once", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }, { slot: 3 }]);
  await tickAt(t, s, "2027-01-16T08:00");
  const day = await firstDay(t, s);
  const celebrate = (except?: Id<"rotaParticipants">) =>
    t.run((ctx) => celebrateIfComplete(ctx, day._id, except));

  await celebrate(); // not complete yet
  expect(await outbox(t, "complete")).toEqual([]);

  await t.run((ctx) => ctx.db.patch(day._id, { completedAt: 1 }));
  await celebrate(s.participants[0]);
  await celebrate();
  const rows = await outbox(t, "complete");
  expect(rows.map((r) => [r.participantId, r.number])).toEqual([
    [s.participants[1], 1],
  ]);
  expect((await firstDay(t, s)).celebratedAt).toBeGreaterThan(0);
});

test("a stopped or silenced participant gets no juz' message", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [
    { slot: 2, stoppedAt: 1 },
    { slot: 3, silencedAt: 1 },
    { slot: 4 },
  ]);
  await tickAt(t, s, "2027-01-16T08:00");
  expect((await outbox(t, "juz")).map((r) => r.participantId)).toEqual([
    s.participants[2],
  ]);
});

test("a day that starts after the reminder time sends no reminder that day", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  await tickAt(t, s, "2027-01-16T17:00");
  await tickAt(t, s, "2027-01-16T18:00");
  expect(await outbox(t, "juz")).toHaveLength(1);
  expect(await outbox(t, "reminder")).toEqual([]);
  expect((await firstDay(t, s)).reminderSentAt).toBe(dubai("2027-01-16T17:00"));
});

test("no reminder for an open day that isn't dated today", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  await tickAt(t, s, "2027-01-16T08:00");
  // The day stays open past midnight and the next date starts nothing.
  const day = await firstDay(t, s);
  await t.run(async (ctx) => {
    await ctx.db.patch(day._id, { closesAt: dubai("2027-01-18T08:00") });
    const k = await ctx.db.get(s.khatmaId);
    await ctx.db.patch(s.khatmaId, {
      rota: { ...k!.rota!, pauseDates: ["2027-01-17"] },
    });
  });
  await tickAt(t, s, "2027-01-17T17:00");
  expect((await firstDay(t, s)).closedAt).toBeNull();
  expect(await outbox(t, "reminder")).toEqual([]);
});

test("a day that closes while the khatma is paused doesn't count toward silence", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  const [id] = s.participants;
  await tickAt(t, s, "2027-01-16T08:00");
  await t.run(async (ctx) => {
    const k = await ctx.db.get(s.khatmaId);
    await ctx.db.patch(s.khatmaId, { rota: { ...k!.rota!, pausedAt: 1 } });
  });
  await tickAt(t, s, "2027-01-17T08:00");
  expect((await firstDay(t, s)).closedAt).not.toBeNull();
  expect((await participant(t, id!)).silentDays ?? 0).toBe(0);
});

function setSetting(t: T, key: string, value: number) {
  return t.run((ctx) =>
    ctx.db.insert("settings", { key, value, updatedAt: 0 }),
  );
}

async function closeDays(t: T, s: Setup, from: number, to: number) {
  for (let d = from; d <= to; d++) {
    await tickAt(t, s, `2027-01-${String(d).padStart(2, "0")}T08:00`);
  }
}

test("the notice goes once when the count first reaches a lowered threshold, not again", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  const [id] = s.participants;
  await setSetting(t, "rotaSilenceNoticeDays", 2);
  await t.run((ctx) => ctx.db.patch(id!, { silentDays: 4 }));
  // Already past the threshold: closing another silent day tells no one.
  await closeDays(t, s, 16, 17);
  expect((await participant(t, id!)).silentDays).toBe(5);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(0);

  // A reply resets the count; reaching the threshold again gives one notice.
  await t.run((ctx) => ctx.db.patch(id!, { silentDays: 0, lastReplyAt: 0 }));
  await closeDays(t, s, 18, 19);
  expect((await participant(t, id!)).silentDays).toBe(2);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(1);
  await closeDays(t, s, 20, 20);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(1);
});

test("when the notice threshold is not below the stop threshold only the silencing note goes", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, [{ slot: 2 }]);
  const [id] = s.participants;
  await setSetting(t, "rotaSilenceNoticeDays", 5);
  await setSetting(t, "rotaSilenceStopDays", 3);
  await closeDays(t, s, 16, 19);
  expect((await participant(t, id!)).silencedAt).not.toBeNull();
  expect(await organizerNotes(t, s, "rotaSilenced")).toHaveLength(1);
  expect(await organizerNotes(t, s, "rotaSilent")).toHaveLength(0);
});

test("when the notice and stop thresholds are equal only the silencing note goes", async () => {
  const t2 = convexTest(schema, modules);
  const s2 = await setup(t2, [{ slot: 2 }]);
  await setSetting(t2, "rotaSilenceNoticeDays", 3);
  await setSetting(t2, "rotaSilenceStopDays", 3);
  await closeDays(t2, s2, 16, 19);
  expect(await organizerNotes(t2, s2, "rotaSilenced")).toHaveLength(1);
  expect(await organizerNotes(t2, s2, "rotaSilent")).toHaveLength(0);
});
