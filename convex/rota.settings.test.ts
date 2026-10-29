import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import { juzFor, type ReadingDays, type RotaMessages } from "./lib/rota";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** A wall-clock time in Asia/Dubai (+04:00, no DST), written `YYYY-MM-DDTHH:MM`. */
function dubai(local: string): number {
  return Date.parse(`${local}:00+04:00`);
}

// 2027-01-15 11:00 in Asia/Dubai (a Friday).
const NOW = dubai("2027-01-15T11:00");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

let seq = 0;

async function person(t: T) {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000400${String(seq).padStart(2, "0")}`,
      displayName: "المنظم",
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

const FRIDAYS: ReadingDays = { kind: "weekly", weekdays: [5], everyWeeks: 1 };

/** A rota khatma whose first date is today (a Friday) unless told otherwise. */
async function setup(
  t: T,
  over: Partial<{
    days: ReadingDays;
    firstDate: string;
    endDate: string | null;
  }> = {},
) {
  const who = await person(t);
  const { inviteCode } = await t.action(api.rota.create, {
    sessionToken: who.token,
    name: "ختمة",
    days: over.days ?? FRIDAYS,
    firstDate: over.firstDate ?? "2027-01-15",
    endDate: over.endDate ?? null,
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

function update(
  t: T,
  s: Setup,
  patch: Partial<{
    name: string | null;
    days: ReadingDays;
    firstDate: string;
    endDate: string | null;
    timeZone: string;
    messages: RotaMessages;
  }>,
  token = s.token,
) {
  return t.mutation(api.rota.update, {
    sessionToken: token,
    inviteCode: s.inviteCode,
    ...patch,
  });
}

function settings(t: T, s: Setup, token = s.token) {
  return t.query(api.rota.settings, {
    sessionToken: token,
    inviteCode: s.inviteCode,
  });
}

function setPaused(t: T, s: Setup, paused: boolean) {
  return t.mutation(api.rota.setPaused, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
    paused,
  });
}

function pauseDate(t: T, s: Setup, kind: "add" | "remove", date: string) {
  return t.mutation(
    kind === "add" ? api.rota.addPauseDate : api.rota.removePauseDate,
    { sessionToken: s.token, inviteCode: s.inviteCode, date },
  );
}

async function tickAt(t: T, s: Setup, local: string) {
  vi.setSystemTime(dubai(local));
  await t.mutation(internal.rotaDays.tick, { khatmaId: s.khatmaId });
}

function days(t: T, s: Setup) {
  return t.run((ctx) =>
    ctx.db
      .query("rotaDays")
      .withIndex("by_khatma_n", (q) => q.eq("khatmaId", s.khatmaId))
      .collect(),
  );
}

const MESSAGES: RotaMessages = {
  dayAt: 480,
  reminder: { at: 960, on: true },
  unread: { at: 1140, on: true },
  summary: { at: 1260, on: false },
};

test("settings shows the organizer everything, and nothing to anyone else", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { endDate: "2027-06-04" });
  expect(await settings(t, s)).toEqual({
    name: "ختمة",
    days: FRIDAYS,
    firstDate: "2027-01-15",
    firstDatePassed: false,
    endDate: "2027-06-04",
    timeZone: "Asia/Dubai",
    messages: MESSAGES,
    pausedAt: null,
    pauseDates: [],
    upcoming: [
      "2027-01-15",
      "2027-01-22",
      "2027-01-29",
      "2027-02-05",
      "2027-02-12",
      "2027-02-19",
      "2027-02-26",
      "2027-03-05",
    ],
    quiet: { startHour: 22, endHour: 7 },
  });

  const stranger = await person(t);
  expect(await settings(t, s, stranger.token)).toBeNull();
  await expect(update(t, s, { name: "x" }, stranger.token)).rejects.toThrow(
    /forbidden/,
  );
  await expect(
    t.mutation(api.rota.setPaused, {
      sessionToken: stranger.token,
      inviteCode: s.inviteCode,
      paused: true,
    }),
  ).rejects.toThrow(/forbidden/);
});

test("settings stops the upcoming dates at the end date, and says when the first date has passed", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { endDate: "2027-01-29" });
  expect((await settings(t, s))?.upcoming).toEqual([
    "2027-01-15",
    "2027-01-22",
    "2027-01-29",
  ]);
  vi.setSystemTime(dubai("2027-01-16T12:00"));
  const later = await settings(t, s);
  expect(later?.firstDatePassed).toBe(true);
  expect(later?.upcoming).toEqual(["2027-01-22", "2027-01-29"]);
});

test("update saves the name, the end date, the time zone and the message times", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const messages: RotaMessages = {
    dayAt: 420,
    reminder: { at: 600, on: false },
    unread: { at: 1200, on: true },
    summary: { at: 1305, on: true },
  };
  expect(
    await update(t, s, {
      name: "ختمة الأسرة",
      endDate: "2027-12-31",
      timeZone: "Asia/Riyadh",
      messages,
    }),
  ).toEqual({ ok: true });
  expect(await settings(t, s)).toMatchObject({
    name: "ختمة الأسرة",
    endDate: "2027-12-31",
    timeZone: "Asia/Riyadh",
    messages,
  });

  expect(await update(t, s, { name: null, endDate: null })).toEqual({
    ok: true,
  });
  expect(await settings(t, s)).toMatchObject({ name: null, endDate: null });
});

test("update refuses bad days, dates, times and zones", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { firstDate: "2027-01-22" });

  expect(
    await update(t, s, {
      days: { kind: "weekly", weekdays: [], everyWeeks: 1 },
    }),
  ).toEqual({ error: "invalid_days" });
  expect(
    await update(t, s, { days: { kind: "monthly", days: [0, 32] } }),
  ).toEqual({ error: "invalid_days" });

  // an end date before the first date
  expect(await update(t, s, { endDate: "2027-01-21" })).toEqual({
    error: "invalid_dates",
  });
  // a first date after the end date that is already set
  await update(t, s, { endDate: "2027-02-12" });
  expect(await update(t, s, { firstDate: "2027-02-19" })).toEqual({
    error: "invalid_dates",
  });
  // not a calendar date
  expect(await update(t, s, { endDate: "2027-02-30" })).toEqual({
    error: "invalid_dates",
  });
  // a first date that is not a reading date (a Saturday on a Fridays khatma)
  expect(await update(t, s, { firstDate: "2027-01-23" })).toEqual({
    error: "invalid_dates",
  });
  // days that leave the first date out
  expect(
    await update(t, s, {
      days: { kind: "weekly", weekdays: [1], everyWeeks: 1 },
    }),
  ).toEqual({ error: "invalid_dates" });
  // a first date before today
  expect(await update(t, s, { firstDate: "2027-01-08" })).toEqual({
    error: "invalid_dates",
  });

  expect(await update(t, s, { messages: { ...MESSAGES, dayAt: 360 } })).toEqual(
    { error: "invalid_times" },
  ); // 06:00 is in the quiet hours
  expect(await update(t, s, { messages: { ...MESSAGES, dayAt: 485 } })).toEqual(
    { error: "invalid_times" },
  ); // not on a 15-minute step
  expect(
    await update(t, s, {
      messages: { ...MESSAGES, reminder: { at: 1200, on: true } },
    }),
  ).toEqual({ error: "invalid_times" }); // reminder after the unread list
  expect(
    await update(t, s, {
      messages: { ...MESSAGES, summary: { at: 1320, on: true } },
    }),
  ).toEqual({ error: "invalid_times" }); // 22:00 is in the quiet hours

  expect(await update(t, s, { timeZone: "Nowhere/Land" })).toEqual({
    error: "invalid_zone",
  });

  // nothing above changed anything
  expect(await settings(t, s)).toMatchObject({
    days: FRIDAYS,
    firstDate: "2027-01-22",
    endDate: "2027-02-12",
    timeZone: "Asia/Dubai",
    messages: MESSAGES,
  });
});

test("message times are checked against the live quiet hours", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  const late: RotaMessages = { ...MESSAGES, unread: { at: 1230, on: true } };
  expect(await update(t, s, { messages: late })).toEqual({ ok: true });

  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "quietStartHour",
      value: 20,
      updatedAt: 0,
    }),
  );
  expect((await settings(t, s))?.quiet).toEqual({ startHour: 20, endHour: 7 });
  expect(await update(t, s, { messages: late })).toEqual({
    error: "invalid_times",
  });
  expect(await update(t, s, { messages: MESSAGES })).toEqual({ ok: true });
});

test("a first date that has passed can't change, but it can be sent back as it is", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  // today is the first date and nothing has started: still free to move
  expect(await update(t, s, { firstDate: "2027-01-22" })).toEqual({
    ok: true,
  });
  expect(await update(t, s, { firstDate: "2027-01-15" })).toEqual({
    ok: true,
  });

  vi.setSystemTime(dubai("2027-01-16T12:00"));
  expect(await update(t, s, { firstDate: "2027-01-22" })).toEqual({
    error: "first_date_passed",
  });
  expect(await update(t, s, { firstDate: "2027-01-15", name: "جديد" })).toEqual(
    { ok: true },
  );
});

test("a first date that has started a day can't change either", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await tickAt(t, s, "2027-01-15T11:00");
  expect(await days(t, s)).toHaveLength(1);
  expect(await update(t, s, { firstDate: "2027-01-22" })).toEqual({
    error: "first_date_passed",
  });
  expect((await settings(t, s))?.firstDatePassed).toBe(true);
});

test("switching from daily to Fridays after day 5 makes the next Friday day 6", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { days: { kind: "daily" } });
  for (const date of [
    "2027-01-15",
    "2027-01-16",
    "2027-01-17",
    "2027-01-18",
    "2027-01-19",
  ]) {
    await tickAt(t, s, `${date}T08:00`);
  }
  expect((await days(t, s)).map((d) => [d.n, d.date])).toHaveLength(5);

  // Tuesday the 19th; Fridays from now on
  expect(await update(t, s, { days: FRIDAYS })).toEqual({ ok: true });
  await tickAt(t, s, "2027-01-20T08:00");
  await tickAt(t, s, "2027-01-21T08:00");
  expect(await days(t, s)).toHaveLength(5);

  await tickAt(t, s, "2027-01-22T08:00");
  const all = await days(t, s);
  expect(all.map((d) => [d.n, d.number, d.date]).slice(4)).toEqual([
    [5, 5, "2027-01-19"],
    [6, 6, "2027-01-22"],
  ]);
  const juzOfOrganizer = async (dayId: (typeof all)[number]["_id"]) =>
    (
      await t.run((ctx) =>
        ctx.db
          .query("rotaReads")
          .withIndex("by_day_juz", (q) => q.eq("dayId", dayId))
          .collect(),
      )
    ).find((r) => r.holderId !== null)?.juz;
  expect(await juzOfOrganizer(all[4]!._id)).toBe(juzFor(1, 5));
  expect(await juzOfOrganizer(all[5]!._id)).toBe(juzFor(1, 5) + 1);
});

test("pausing skips days until the khatma is resumed", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { days: { kind: "daily" } });
  await tickAt(t, s, "2027-01-15T08:00");
  expect((await days(t, s)).map((d) => d.date)).toEqual(["2027-01-15"]);

  vi.setSystemTime(dubai("2027-01-15T20:00"));
  expect(await setPaused(t, s, true)).toEqual({ ok: true });
  expect((await settings(t, s))?.pausedAt).toBe(dubai("2027-01-15T20:00"));
  await tickAt(t, s, "2027-01-16T08:00");
  await tickAt(t, s, "2027-01-17T08:00");
  expect(await days(t, s)).toHaveLength(1);

  vi.setSystemTime(dubai("2027-01-17T10:00"));
  expect(await setPaused(t, s, false)).toEqual({ ok: true });
  expect((await settings(t, s))?.pausedAt).toBeNull();
  await tickAt(t, s, "2027-01-17T10:15");
  expect((await days(t, s)).map((d) => [d.n, d.date])).toEqual([
    [1, "2027-01-15"],
    [2, "2027-01-17"],
  ]);
});

test("pausing keeps the pause dates, and the people screen has no target date while paused", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t);
  await pauseDate(t, s, "add", "2027-01-22");
  await setPaused(t, s, true);
  expect((await settings(t, s))?.pauseDates).toEqual(["2027-01-22"]);
  const people = await t.query(api.rota.people, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
  });
  expect(people?.target.date).toBeNull();
  await setPaused(t, s, false);
  const resumed = await t.query(api.rota.people, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
  });
  expect(resumed?.target.date).toBe("2027-01-15");
});

test("pause dates: only reading dates, never past or started ones", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { endDate: "2027-02-05" });
  // a Saturday, a Friday after the end date, and something that is not a date
  expect(await pauseDate(t, s, "add", "2027-01-23")).toEqual({
    error: "not_reading_date",
  });
  expect(await pauseDate(t, s, "add", "2027-02-12")).toEqual({
    error: "not_reading_date",
  });
  expect(await pauseDate(t, s, "add", "soon")).toEqual({
    error: "not_reading_date",
  });
  // a Friday before the first date
  expect(await pauseDate(t, s, "add", "2027-01-08")).toEqual({
    error: "not_reading_date",
  });

  await tickAt(t, s, "2027-01-15T08:00");
  // today's day has started
  expect(await pauseDate(t, s, "add", "2027-01-15")).toEqual({ error: "past" });

  vi.setSystemTime(dubai("2027-01-23T12:00"));
  // a Friday that is behind us
  expect(await pauseDate(t, s, "add", "2027-01-22")).toEqual({ error: "past" });
  expect(await pauseDate(t, s, "remove", "2027-01-22")).toEqual({
    error: "past",
  });

  expect(await pauseDate(t, s, "add", "2027-01-29")).toEqual({ ok: true });
  // adding it again changes nothing
  expect(await pauseDate(t, s, "add", "2027-01-29")).toEqual({ ok: true });
  expect((await settings(t, s))?.pauseDates).toEqual(["2027-01-29"]);
});

test("a pause date added then removed restores that date", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, {
    days: { kind: "daily" },
    firstDate: "2027-01-16",
  });
  expect(await pauseDate(t, s, "add", "2027-01-16")).toEqual({ ok: true });
  expect((await settings(t, s))?.pauseDates).toEqual(["2027-01-16"]);
  await tickAt(t, s, "2027-01-16T08:00");
  expect(await days(t, s)).toHaveLength(0);

  expect(await pauseDate(t, s, "remove", "2027-01-16")).toEqual({ ok: true });
  expect((await settings(t, s))?.pauseDates).toEqual([]);
  await tickAt(t, s, "2027-01-16T08:15");
  expect((await days(t, s)).map((d) => [d.n, d.date])).toEqual([
    [1, "2027-01-16"],
  ]);
  // removing a date that is not there is fine
  expect(await pauseDate(t, s, "remove", "2027-01-17")).toEqual({ ok: true });
});

test("a westward time zone change never starts or targets a date behind the last day", async () => {
  const t = convexTest(schema, modules);
  const s = await setup(t, { days: { kind: "daily" } });
  await tickAt(t, s, "2027-01-15T08:00");
  await tickAt(t, s, "2027-01-17T08:00"); // the 16th is missed
  expect((await days(t, s)).map((d) => d.date)).toEqual([
    "2027-01-15",
    "2027-01-17",
  ]);

  // 09:00 in Dubai on the 17th is still the 16th in Honolulu: a reading date with no row
  vi.setSystemTime(dubai("2027-01-17T09:00"));
  expect(await update(t, s, { timeZone: "Pacific/Honolulu" })).toEqual({
    ok: true,
  });
  await t.mutation(internal.rotaDays.tick, { khatmaId: s.khatmaId });
  expect((await days(t, s)).map((d) => d.date)).toEqual([
    "2027-01-15",
    "2027-01-17",
  ]);
  const people = await t.query(api.rota.people, {
    sessionToken: s.token,
    inviteCode: s.inviteCode,
  });
  expect(people?.target.date).toBe("2027-01-18");
});
