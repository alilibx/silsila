import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 2027-01-15 12:00 in Asia/Dubai (UTC+4), a Friday. */
const NOW = 1_800_000_000_000;
const TZ = "Asia/Dubai";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

let seq = 0;

/** A person with a live session. */
async function signedIn(t: T, displayName: string) {
  seq += 1;
  const token = `nudge-token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const ids = await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: `+97156000${String(seq).padStart(4, "0")}`,
      displayName,
      verifiedAt: 0,
      timeZone: TZ,
      lastSeenAt: 0,
    });
    const sessionId = await ctx.db.insert("sessions", {
      personId,
      tokenHash,
      alertTokenHash: `alert-${seq}`,
      deviceLabel: "test",
      createdAt: NOW,
      lastUsedAt: NOW,
    });
    return { personId, sessionId };
  });
  return { ...ids, token, displayName };
}
type Who = Awaited<ReturnType<typeof signedIn>>;

async function createKhatma(
  t: T,
  who: Who,
  schedule: Doc<"khatmas">["schedule"],
) {
  const at = Date.now();
  const { inviteCode } = await t.action(api.khatmas.create, {
    sessionToken: who.token,
    name: null,
    schedule,
  });
  // an action nudges the fake clock; nothing is scheduled yet, so reset it
  vi.setSystemTime(at);
  const khatma = await t.run(async (ctx) =>
    ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique(),
  );
  if (!khatma) throw new Error("no khatma");
  return { code: inviteCode, khatma };
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

async function memberOf(t: T, khatmaId: Id<"khatmas">, who: Who) {
  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_khatma_person", (q) =>
        q.eq("khatmaId", khatmaId).eq("personId", who.personId),
      )
      .unique(),
  );
  if (!member) throw new Error("no member");
  return member;
}

/**
 * A finished row for `juz`, taken `durationMs` before it finished. In the
 * current round by default, or in a stand-in earlier round `roundNumber` (so
 * seeded history never changes the current round's progress).
 */
async function insertDone(
  t: T,
  khatma: Doc<"khatmas">,
  who: Who,
  juz: number,
  durationMs: number,
  opts: { finishedAt?: number; earlierRound?: number } = {},
) {
  const member = await memberOf(t, khatma._id, who);
  const finishedAt = opts.finishedAt ?? Date.now();
  await t.run(async (ctx) => {
    let roundId = khatma.currentRoundId;
    let roundNumber = 1;
    if (opts.earlierRound !== undefined) {
      roundNumber = opts.earlierRound;
      const existing = await ctx.db
        .query("rounds")
        .withIndex("by_khatma_number", (q) =>
          q.eq("khatmaId", khatma._id).eq("number", roundNumber),
        )
        .unique();
      roundId =
        existing?._id ??
        (await ctx.db.insert("rounds", {
          khatmaId: khatma._id,
          number: roundNumber,
          startedAt: 0,
          targetEndAt: null,
          completedAt: 1,
          lastFinishedAt: null,
          behindInvitedAt: null,
        }));
    }
    if (!roundId) throw new Error("bad fixture");
    await ctx.db.insert("assignments", {
      khatmaId: khatma._id,
      roundId,
      roundNumber,
      juz,
      memberId: member._id,
      personId: who.personId,
      takenAt: finishedAt - durationMs,
      finishedAt,
      releasedAt: null,
      releasedBySystem: false,
      graceWakingMs: 6 * HOUR,
      noticeAt: finishedAt,
      graceEndsAt: finishedAt,
      extended: false,
      noticeSentAt: null,
      openedForHelpAt: null,
      remindedAt: null,
    });
  });
}

/** Three finishes of `durationMs` in an earlier round: a known pace. */
async function seedPace(
  t: T,
  khatma: Doc<"khatmas">,
  who: Who,
  durationMs: number,
) {
  for (const juz of [1, 2, 3]) {
    await insertDone(t, khatma, who, juz, durationMs, {
      earlierRound: 100,
      finishedAt: NOW - 10 * DAY + juz,
    });
  }
}

/** A hold in the current round, inserted directly. */
async function insertHeld(t: T, khatma: Doc<"khatmas">, who: Who, juz: number) {
  const member = await memberOf(t, khatma._id, who);
  await t.run(async (ctx) => {
    if (!khatma.currentRoundId) throw new Error("bad fixture");
    await ctx.db.insert("assignments", {
      khatmaId: khatma._id,
      roundId: khatma.currentRoundId,
      roundNumber: 1,
      juz,
      memberId: member._id,
      personId: who.personId,
      takenAt: Date.now(),
      finishedAt: null,
      releasedAt: null,
      releasedBySystem: false,
      graceWakingMs: 6 * HOUR,
      noticeAt: Date.now() + 5 * HOUR,
      graceEndsAt: Date.now() + 6 * HOUR,
      extended: false,
      noticeSentAt: null,
      openedForHelpAt: null,
      remindedAt: null,
    });
  });
}

async function rowOf(t: T, khatmaId: Id<"khatmas">, juz: number) {
  const rows = await t.run((ctx) => ctx.db.query("assignments").collect());
  const mine = rows
    .filter(
      (a) => a.khatmaId === khatmaId && a.juz === juz && a.roundNumber === 1,
    )
    .sort((a, b) => b._creationTime - a._creationTime);
  if (!mine[0]) throw new Error(`no row for juz ${juz}`);
  return mine[0];
}

async function notesOf(t: T, who: Who, kind?: Doc<"notes">["kind"]) {
  const notes = await t.run((ctx) => ctx.db.query("notes").collect());
  return notes.filter(
    (n) => n.personId === who.personId && (!kind || n.kind === kind),
  );
}

async function scheduled(t: T, fragment: string) {
  const rows = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  return rows.filter((r) => r.name.includes(fragment));
}

/** convex-test's clock ticks a millisecond or so inside a call; allow a second. */
function expectNear(actual: number | null | undefined, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected);
  expect(actual).toBeLessThan(expected + 1000);
}

/** Moves the clock to `at`, running every scheduled function due by then. */
async function advanceTo(t: T, at: number) {
  vi.advanceTimersByTime(Math.max(0, at - Date.now()));
  await t.finishInProgressScheduledFunctions();
}

const take = (t: T, code: string, who: Who, juz: number) =>
  t.mutation(api.pool.take, { sessionToken: who.token, inviteCode: code, juz });
const reminderDue = (t: T, row: Doc<"assignments">) =>
  t.mutation(internal.nudges.reminderDue, { assignmentId: row._id });

/** Runs the hourly sweep and the per-khatma checks it schedules. */
async function sweep(t: T) {
  await t.mutation(internal.nudges.behindSweep, {});
  await advanceTo(t, Date.now() + 10);
}

async function setup(schedule: Doc<"khatmas">["schedule"]) {
  const t = convexTest(schema, modules);
  const org = await signedIn(t, "المنظم");
  const { code, khatma } = await createKhatma(t, org, schedule);
  return { t, org, code, khatma };
}

test("reminder at 1.5x pace, once, never after almost-up, never inside the cooldown", async () => {
  // a monthly khatma has a 7-day grace, so the almost-up note comes after 1.5x of the default 3 days
  const { t, code, khatma } = await setup("monthly");
  const ali = await signedIn(t, "علي");
  vi.setSystemTime(NOW + 19 * HOUR); // 07:00 in Dubai, the next morning
  expect(await take(t, code, ali, 12)).toEqual({ ok: true });
  const row = await rowOf(t, khatma._id, 12);
  const takenAt = row.takenAt;

  // default pace is 3 days: the reminder is due 4.5 days on, at 19:00
  const [job] = await scheduled(t, "reminderDue");
  expect(job?.scheduledTime).toBe(takenAt + 4.5 * DAY);
  expect(job?.args).toEqual([{ assignmentId: row._id }]);

  await advanceTo(t, takenAt + 4.5 * DAY - 1);
  expect(await notesOf(t, ali, "reminder")).toHaveLength(0);
  await advanceTo(t, takenAt + 4.5 * DAY);
  const [note] = await notesOf(t, ali, "reminder");
  expect(note).toMatchObject({
    juz: [12],
    assignmentId: row._id,
    clearedAt: null,
  });
  const after = await rowOf(t, khatma._id, 12);
  expectNear(after.remindedAt, takenAt + 4.5 * DAY);
  expectNear(
    (await memberOf(t, khatma._id, ali)).lastNudgeAt,
    takenAt + 4.5 * DAY,
  );

  // once
  await reminderDue(t, row);
  expect(await notesOf(t, ali, "reminder")).toHaveLength(1);
});

test("the reminder waits for the reader's own pace and for waking hours", async () => {
  const { t, code, khatma } = await setup("monthly");
  const ali = await signedIn(t, "علي");
  await join(t, khatma._id, ali);
  await seedPace(t, khatma, ali, 2 * DAY); // pace 2 days → reminder at 3 days
  expect(await take(t, code, ali, 12)).toEqual({ ok: true });
  const [job] = await scheduled(t, "reminderDue");
  // taken at 12:00, due 12:00 three days on
  expect(job?.scheduledTime).toBeGreaterThanOrEqual(NOW + 3 * DAY);
  expect(job?.scheduledTime).toBeLessThan(NOW + 3 * DAY + 1000);

  // a quiet-hours moment moves to 07:00: pace 3 days from 12:00 is 00:00
  const bob = await signedIn(t, "بدر");
  await join(t, khatma._id, bob);
  expect(await take(t, code, bob, 13)).toEqual({ ok: true });
  const jobs = await scheduled(t, "reminderDue");
  const bobs = jobs.find((j) => j.scheduledTime !== job?.scheduledTime);
  // 12:00 + 4.5 days = 00:00, held until 07:00
  expect(bobs?.scheduledTime).toBeGreaterThanOrEqual(
    NOW + 4.5 * DAY + 7 * HOUR,
  );
  expect(bobs?.scheduledTime).toBeLessThan(NOW + 4.5 * DAY + 7 * HOUR + 1000);
});

test("reminder is skipped once the juz' is finished, released, opened, or the cooldown is on", async () => {
  const { t, code, khatma } = await setup("monthly");
  const people: Who[] = [];
  vi.setSystemTime(NOW + 19 * HOUR);
  for (const [i, name] of ["أ", "ب", "ج", "د"].entries()) {
    const who = await signedIn(t, name);
    people.push(who);
    await join(t, khatma._id, who);
    expect(await take(t, code, who, 10 + i)).toEqual({ ok: true });
  }
  const rows = await Promise.all(
    [10, 11, 12, 13].map((j) => rowOf(t, khatma._id, j)),
  );
  const [finished, released, opened, cooling] = rows as [
    Doc<"assignments">,
    Doc<"assignments">,
    Doc<"assignments">,
    Doc<"assignments">,
  ];
  vi.setSystemTime(NOW + 4 * DAY);
  await t.run(async (ctx) => {
    await ctx.db.patch(finished._id, { finishedAt: NOW });
    await ctx.db.patch(released._id, { releasedAt: NOW });
    await ctx.db.patch(opened._id, { openedForHelpAt: NOW });
  });
  const cooler = people[3] as Who;
  const member = await memberOf(t, khatma._id, cooler);
  await t.run((ctx) =>
    ctx.db.patch(member._id, { lastNudgeAt: Date.now() - HOUR }),
  );
  for (const row of rows) await reminderDue(t, row);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toHaveLength(0);

  // the same member once the cooldown has passed
  await t.run((ctx) =>
    ctx.db.patch(member._id, { lastNudgeAt: Date.now() - DAY - 1 }),
  );
  await reminderDue(t, cooling);
  expect(await notesOf(t, cooler, "reminder")).toHaveLength(1);
});

test("daily khatma: almost-up comes first and the reminder is skipped", async () => {
  const { t, code, khatma } = await setup("daily");
  const ali = await signedIn(t, "علي");
  vi.setSystemTime(NOW + 19 * HOUR);
  expect(await take(t, code, ali, 12)).toEqual({ ok: true });
  const row = await rowOf(t, khatma._id, 12);
  const takenAt = row.takenAt;

  await advanceTo(t, row.noticeAt);
  expect(await notesOf(t, ali, "almostUp")).toHaveLength(1);
  // the almost-up note is out: a reminder due now (even forced) stays quiet
  await reminderDue(t, row);
  expect(await notesOf(t, ali, "reminder")).toHaveLength(0);

  // and the whole way to 1.5x pace nothing reminds them
  await advanceTo(t, takenAt + 5 * DAY);
  expect(await notesOf(t, ali, "reminder")).toHaveLength(0);
  expect((await memberOf(t, khatma._id, ali)).lastNudgeAt).toBeNull();
});

test("the reminder is skipped when the almost-up note is due the same local day", async () => {
  // monthly, taken at 12:00: reminder 00:00→07:00 on day 5, almost-up 15:45 that same day
  const { t, code, khatma } = await setup("monthly");
  const ali = await signedIn(t, "علي");
  expect(await take(t, code, ali, 12)).toEqual({ ok: true });
  await advanceTo(t, NOW + 4.5 * DAY + 7 * HOUR);
  expect(await notesOf(t, ali, "reminder")).toHaveLength(0);
  expect((await rowOf(t, khatma._id, 12)).remindedAt).toBeNull();
});

/**
 * A weekly khatma 0.1 day in, so 6.9 days remain. Every member's pace is
 * between 1 and 1.15 days, so each can read 6 more ajza' before the end.
 */
function behindSetup() {
  return setup("weekly");
}

async function roundOf(t: T, khatmaId: Id<"khatmas">) {
  const round = await t.run(async (ctx) => {
    const khatma = await ctx.db.get(khatmaId);
    return khatma?.currentRoundId ? ctx.db.get(khatma.currentRoundId) : null;
  });
  if (!round) throw new Error("no round");
  return round;
}

test("behind invite goes to the fastest free members first and never to holders", async () => {
  const { t, org, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  // 1.9 days left at the end of the weekly round
  vi.setSystemTime((round.targetEndAt as number) - 1.9 * DAY);

  const [a, b, c, h] = [
    await signedIn(t, "أ"),
    await signedIn(t, "ب"),
    await signedIn(t, "ج"),
    await signedIn(t, "هـ"),
  ] as [Who, Who, Who, Who];
  for (const who of [a, b, c, h]) await join(t, khatma._id, who);
  // paces: b 1.0 < c 1.1 < a 1.2 < org 1.3; the holder is the fastest of all
  await seedPace(t, khatma, b, 1.0 * DAY);
  await seedPace(t, khatma, c, 1.1 * DAY);
  await seedPace(t, khatma, a, 1.2 * DAY);
  await seedPace(t, khatma, h, 1.0 * DAY);
  // org finishes 23 ajza' (each taken 1.3 days before), and h holds one
  for (let juz = 1; juz <= 23; juz++) {
    await insertDone(t, khatma, org, juz, 1.3 * DAY);
  }
  await insertHeld(t, khatma, h, 24);
  // open = 30 - 23 - 1 = 6; capacity = 5 members x 1 - 1 holder = 4 → shortfall 2
  await sweep(t);

  expect(await notesOf(t, b, "behind")).toHaveLength(1);
  expect(await notesOf(t, c, "behind")).toHaveLength(1);
  expect(await notesOf(t, a, "behind")).toHaveLength(0);
  expect(await notesOf(t, org, "behind")).toHaveLength(0);
  expect(await notesOf(t, h, "behind")).toHaveLength(0);
  const [note] = await notesOf(t, b, "behind");
  expect(note).toMatchObject({
    count: 6,
    until: round.targetEndAt,
    roundNumber: 1,
    juz: [],
    assignmentId: null,
  });
  expectNear((await memberOf(t, khatma._id, b)).lastNudgeAt, Date.now() - 500);
  expect((await memberOf(t, khatma._id, a)).lastNudgeAt).toBeNull();
  expect((await roundOf(t, khatma._id)).behindInvitedAt).not.toBeNull();
});

test("taking a juz' clears the taker's behind invite and kills its queued push", async () => {
  const { t, org, code, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  vi.setSystemTime(round.startedAt + 0.1 * DAY); // 6.9 days left

  const a = await signedIn(t, "أ");
  const b = await signedIn(t, "ب");
  await join(t, khatma._id, a);
  await join(t, khatma._id, b);
  for (const who of [a, b]) {
    await t.run((ctx) =>
      ctx.db.insert("pushSubscriptions", {
        personId: who.personId,
        sessionId: who.sessionId,
        endpoint: `https://push.example/${who.personId}`,
        p256dh: "p",
        auth: "a",
        createdAt: NOW,
      }),
    );
  }
  await seedPace(t, khatma, a, 1.0 * DAY);
  await seedPace(t, khatma, b, 1.05 * DAY);
  for (let juz = 1; juz <= 10; juz++) {
    await insertDone(t, khatma, org, juz, 1.1 * DAY);
  }
  await sweep(t);
  const [aNote] = await notesOf(t, a, "behind");
  const [bNote] = await notesOf(t, b, "behind");
  if (!aNote || !bNote) throw new Error("both members should be invited");
  const plan = (noteId: Id<"notes">) =>
    t.query(internal.push.deliveryPlan, { noteId });
  expect(await plan(aNote._id)).not.toBeNull();

  expect(await take(t, code, a, 11)).toEqual({ ok: true });
  const [cleared] = await notesOf(t, a, "behind");
  expect(cleared?.clearedAt).not.toBeNull();
  expect(await plan(aNote._id)).toBeNull();
  // someone else's invite is untouched
  const [other] = await notesOf(t, b, "behind");
  expect(other?.clearedAt).toBeNull();
  expect(await plan(bNote._id)).not.toBeNull();
});

test("behind invite reaches only as many members as the shortfall", async () => {
  const { t, org, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  vi.setSystemTime(round.startedAt + 0.1 * DAY); // 6.9 days left

  const a = await signedIn(t, "أ");
  const b = await signedIn(t, "ب");
  await join(t, khatma._id, a);
  await join(t, khatma._id, b);
  await seedPace(t, khatma, a, 1.0 * DAY);
  await seedPace(t, khatma, b, 1.05 * DAY);
  // org finishes 10 ajza' at a 1.1-day pace: open 20; 3 members x 6 = capacity 18
  for (let juz = 1; juz <= 10; juz++) {
    await insertDone(t, khatma, org, juz, 1.1 * DAY);
  }
  await sweep(t);

  expect(await notesOf(t, a, "behind")).toHaveLength(1);
  expect(await notesOf(t, b, "behind")).toHaveLength(1);
  expect(await notesOf(t, org, "behind")).toHaveLength(0);
  const [note] = await notesOf(t, a, "behind");
  expect(note?.count).toBe(20);
});

test("a round that is on track sends no invite", async () => {
  const { t, org, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  vi.setSystemTime(round.startedAt + 0.1 * DAY); // 6.9 days left
  for (const name of ["أ", "ب", "ج", "د", "هـ"]) {
    await join(t, khatma._id, await signedIn(t, name));
  }
  // six members at the default 3-day pace read 2 each: capacity 12, open 12
  for (let juz = 1; juz <= 18; juz++) {
    await insertDone(t, khatma, org, juz, 0);
  }
  await sweep(t);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toHaveLength(0);
  expect((await roundOf(t, khatma._id)).behindInvitedAt).toBeNull();
});

test("behind invite widens at most once a day and is off for no-deadline khatmas", async () => {
  const { t, org, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  vi.setSystemTime(round.startedAt + 0.1 * DAY); // 6.9 days left
  const a = await signedIn(t, "أ");
  const b = await signedIn(t, "ب");
  await join(t, khatma._id, a);
  await join(t, khatma._id, b);
  await seedPace(t, khatma, a, 1.0 * DAY);
  await seedPace(t, khatma, b, 1.05 * DAY);
  for (let juz = 1; juz <= 10; juz++) {
    await insertDone(t, khatma, org, juz, 1.1 * DAY);
  }
  await sweep(t);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toHaveLength(2);

  // an hour later nothing new goes out, even though a and b are still free
  await advanceTo(t, Date.now() + HOUR);
  await sweep(t);
  expect(await t.run((ctx) => ctx.db.query("notes").collect())).toHaveLength(2);

  // a day later the round is further behind (5.9 days, 5 each, capacity 15):
  // the invite widens to the member not yet invited, and nobody gets two
  await advanceTo(t, Date.now() + DAY);
  await sweep(t);
  expect(await notesOf(t, org, "behind")).toHaveLength(1);
  expect(await notesOf(t, a, "behind")).toHaveLength(1);
  expect(await notesOf(t, b, "behind")).toHaveLength(1);

  // a khatma without a deadline is never behind
  const none = await createKhatma(t, org, "none");
  expect((await roundOf(t, none.khatma._id)).targetEndAt).toBeNull();
  await sweep(t);
  expect(
    (await t.run((ctx) => ctx.db.query("notes").collect())).filter(
      (n) => n.khatmaId === none.khatma._id,
    ),
  ).toHaveLength(0);
});

test("past the target end every free member is invited, fastest first up to the open count", async () => {
  const { t, org, khatma } = await behindSetup();
  const round = await roundOf(t, khatma._id);
  const [a, b, c] = [
    await signedIn(t, "أ"),
    await signedIn(t, "ب"),
    await signedIn(t, "ج"),
  ] as [Who, Who, Who];
  for (const who of [a, b, c]) await join(t, khatma._id, who);
  for (let juz = 1; juz <= 28; juz++) {
    await insertDone(t, khatma, org, juz, 0);
  }
  // 2 open, deadline passed, 4 free members: the 2 fastest
  await seedPace(t, khatma, c, 1.0 * DAY);
  await seedPace(t, khatma, a, 1.5 * DAY);
  await seedPace(t, khatma, b, 2 * DAY);
  vi.setSystemTime((round.targetEndAt as number) + HOUR);
  await sweep(t);
  expect(await notesOf(t, c, "behind")).toHaveLength(1);
  expect(await notesOf(t, a, "behind")).toHaveLength(1);
  expect(await notesOf(t, b, "behind")).toHaveLength(0);
  expect(await notesOf(t, org, "behind")).toHaveLength(0);
  const [note] = await notesOf(t, c, "behind");
  expect(note?.count).toBe(2);
});

test("completion sends one completed note per active member and clears the round's behind invites", async () => {
  const { t, org, khatma } = await setup("weekly");
  const a = await signedIn(t, "أ");
  const gone = await signedIn(t, "ب");
  await join(t, khatma._id, a);
  await join(t, khatma._id, gone);
  const goneMember = await memberOf(t, khatma._id, gone);
  await t.run((ctx) => ctx.db.patch(goneMember._id, { status: "former" }));
  await t.run((ctx) =>
    ctx.db.insert("notes", {
      personId: a.personId,
      khatmaId: khatma._id,
      kind: "behind",
      juz: [],
      count: 3,
      until: null,
      assignmentId: null,
      roundNumber: 1,
      createdAt: NOW,
      pushedAt: null,
      clearedAt: null,
    }),
  );
  for (let juz = 1; juz <= 30; juz++) {
    await insertDone(t, khatma, juz % 2 ? org : a, juz, HOUR);
  }
  await t.run((ctx) =>
    ctx.db.patch(khatma.currentRoundId as Id<"rounds">, {
      lastFinishedAt: NOW,
    }),
  );
  vi.setSystemTime(NOW + 11_000);
  expect(
    await t.mutation(internal.rounds.completeIfReady, {
      roundId: khatma.currentRoundId as Id<"rounds">,
    }),
  ).toEqual({ completed: true });

  for (const who of [org, a]) {
    const done = await notesOf(t, who, "completed");
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ roundNumber: 1, clearedAt: null });
  }
  expect(await notesOf(t, gone, "completed")).toHaveLength(0);
  const [behind] = await notesOf(t, a, "behind");
  expect(behind?.clearedAt).not.toBeNull();
  // no nudge cooldown is spent by the completion message
  expect((await memberOf(t, khatma._id, a)).lastNudgeAt).toBeNull();
});
