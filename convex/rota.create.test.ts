import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import type { ReadingDays } from "./lib/rota";
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

async function organizer(t: T, rotaAllowed = true) {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000100${String(seq).padStart(2, "0")}`,
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

const fridays: ReadingDays = { kind: "weekly", weekdays: [5], everyWeeks: 1 };

function create(
  t: T,
  who: { token: string },
  over: Partial<{
    days: ReadingDays;
    firstDate: string;
    endDate: string | null;
  }> = {},
) {
  return t.action(api.rota.create, {
    sessionToken: who.token,
    name: "ختمة الأحباب",
    days: fridays,
    firstDate: "2027-01-15",
    endDate: null,
    ...over,
  });
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code;
  }
  return undefined;
}

test("creates a rota khatma with the organizer on slot 1", async () => {
  const t = convexTest(schema, modules);
  const who = await organizer(t);
  const { inviteCode } = await create(t, who);

  await t.run(async (ctx) => {
    const khatma = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    expect(khatma).toMatchObject({
      kind: "rota",
      name: "ختمة الأحباب",
      schedule: "none",
      completedRounds: 0,
      creatorPersonId: who.personId,
    });
    expect(khatma?.currentRoundId).toBeUndefined();
    expect(khatma?.rota).toMatchObject({
      days: fridays,
      firstDate: "2027-01-15",
      endDate: null,
      timeZone: "Asia/Dubai",
      pausedAt: null,
      pauseDates: [],
      archivedAt: null,
      messages: {
        dayAt: 480,
        reminder: { at: 960, on: true },
        unread: { at: 1140, on: true },
        summary: { at: 1260, on: false },
      },
    });
    const members = await ctx.db
      .query("members")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma!._id))
      .collect();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      personId: who.personId,
      status: "active",
      notificationsOn: true,
    });
    expect(members[0]?.shareToken).toBeTruthy();
    const participants = await ctx.db
      .query("rotaParticipants")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma!._id))
      .collect();
    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      name: "المنظم",
      phone: `+9715000100${String(seq).padStart(2, "0")}`,
      personId: who.personId,
      removedAt: null,
    });
    const slots = await ctx.db
      .query("rotaSlots")
      .withIndex("by_khatma_slot", (q) => q.eq("khatmaId", khatma!._id))
      .collect();
    expect(slots.map((s) => [s.slot, s.participantId])).toEqual([
      [1, participants[0]?._id],
    ]);
  });
});

test("refuses someone who was not allowed to create one", async () => {
  const t = convexTest(schema, modules);
  const who = await organizer(t, false);
  expect(await code(create(t, who))).toBe("rota_not_allowed");
});

test("refuses without a session", async () => {
  const t = convexTest(schema, modules);
  expect(await code(create(t, { token: "nope" }))).toBe("not_signed_in");
});

test("refuses a third active rota khatma but not once one is archived", async () => {
  const t = convexTest(schema, modules);
  const who = await organizer(t);
  const first = await create(t, who);
  await create(t, who);
  expect(await code(create(t, who))).toBe("rota_cap");

  await t.run(async (ctx) => {
    const khatma = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", first.inviteCode))
      .unique();
    await ctx.db.patch(khatma!._id, {
      rota: { ...khatma!.rota!, archivedAt: NOW },
    });
  });
  await create(t, who);
});

test("refuses bad reading days and bad dates", async () => {
  const t = convexTest(schema, modules);
  const who = await organizer(t);
  expect(
    await code(
      create(t, who, {
        days: { kind: "weekly", weekdays: [], everyWeeks: 1 },
      }),
    ),
  ).toBe("invalid_days");
  expect(await code(create(t, who, { firstDate: "2027-01-14" }))).toBe(
    "invalid_dates",
  );
  expect(
    await code(
      create(t, who, { firstDate: "2027-01-22", endDate: "2027-01-15" }),
    ),
  ).toBe("invalid_dates");
  // 2027-01-16 is a Saturday, not one of a Fridays-only khatma's days.
  expect(await code(create(t, who, { firstDate: "2027-01-16" }))).toBe(
    "invalid_dates",
  );
  expect(await code(create(t, who, { firstDate: "soon" }))).toBe(
    "invalid_dates",
  );
});

test("a daily khatma may start today and end later", async () => {
  const t = convexTest(schema, modules);
  const who = await organizer(t);
  await create(t, who, {
    days: { kind: "daily" },
    firstDate: "2027-01-15",
    endDate: "2027-01-15",
  });
});
