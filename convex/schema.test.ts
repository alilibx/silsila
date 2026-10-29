import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("khatma schedule is validated against SCHEDULES", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const creatorPersonId = await ctx.db.insert("people", {
      phone: "+966500000000",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
      lastSeenAt: 0,
    });
    const base = {
      name: null,
      grace: { value: 2, unit: "days" as const },
      creatorPersonId,
      inviteCode: "abc",
      completedRounds: 0,
      createdAt: 0,
    };
    await expect(
      ctx.db.insert("khatmas", { ...base, schedule: "daily" }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.db.insert("khatmas", {
        ...base,
        // @ts-expect-error "yearly" is never offered
        schedule: "yearly",
      }),
    ).rejects.toThrow();
  });
});

test("people can be read back by phone index", async () => {
  const t = convexTest(schema, modules);
  const id: Id<"people"> = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "+966500000001",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
      lastSeenAt: 0,
    }),
  );
  const found = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_phone", (q) => q.eq("phone", "+966500000001"))
      .first(),
  );
  expect(found?._id).toBe(id);
});

test("plan 2 tables accept their documented shapes", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: "+966500000002",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
      lastSeenAt: 0,
    });
    const khatmaId = await ctx.db.insert("khatmas", {
      name: null,
      schedule: "none",
      grace: { value: 7, unit: "days" },
      creatorPersonId: personId,
      inviteCode: "plan2",
      completedRounds: 0,
      createdAt: 0,
    });
    const sessionId = await ctx.db.insert("sessions", {
      personId,
      tokenHash: "a",
      alertTokenHash: "b",
      deviceLabel: "test",
      createdAt: 0,
      lastUsedAt: 0,
    });
    await expect(
      ctx.db.insert("notes", {
        personId,
        khatmaId,
        kind: "almostUp",
        juz: [3],
        count: null,
        until: null,
        assignmentId: null,
        roundNumber: null,
        createdAt: 0,
        pushedAt: null,
        clearedAt: null,
      }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.db.insert("notes", {
        personId,
        khatmaId,
        // @ts-expect-error "shout" is not a note kind
        kind: "shout",
        juz: [],
        count: null,
        until: null,
        assignmentId: null,
        roundNumber: null,
        createdAt: 0,
        pushedAt: null,
        clearedAt: null,
      }),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert("pushSubscriptions", {
        personId,
        sessionId,
        endpoint: "https://push.example/1",
        p256dh: "k",
        auth: "a",
        createdAt: 0,
      }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.db.insert("handoffTokens", {
        tokenHash: "h",
        personId,
        sessionId,
        createdAt: 0,
        expiresAt: 1,
        usedAt: null,
      }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.db.insert("members", {
        khatmaId,
        personId,
        joinedAt: 0,
        status: "former",
        notificationsOn: true,
        lastNudgeAt: null,
        lastCelebratedRound: 0,
      }),
    ).resolves.toBeTruthy();
  });
});

test("rota tables accept their documented shapes", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: "+966500000003",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
      lastSeenAt: 0,
      rotaAllowed: true,
    });
    const khatmaId = await ctx.db.insert("khatmas", {
      name: null,
      schedule: "none",
      grace: { value: 7, unit: "days" },
      creatorPersonId: personId,
      inviteCode: "rota",
      completedRounds: 0,
      createdAt: 0,
      kind: "rota",
      rota: {
        days: { kind: "weekly", weekdays: [5], everyWeeks: 1 },
        firstDate: "2027-01-15",
        endDate: null,
        timeZone: "Asia/Dubai",
        messages: {
          dayAt: 480,
          reminder: { at: 960, on: true },
          unread: { at: 1140, on: true },
          summary: { at: 1260, on: false },
        },
        pausedAt: null,
        pauseDates: [],
        archivedAt: null,
      },
    });
    const participantId = await ctx.db.insert("rotaParticipants", {
      khatmaId,
      name: "x",
      phone: "+966500000004",
      personId: null,
      addedAt: 0,
      removedAt: null,
    });
    await ctx.db.insert("rotaSlots", { khatmaId, slot: 1, participantId });
    const dayId = await ctx.db.insert("rotaDays", {
      khatmaId,
      n: 1,
      number: 1,
      cycle: 1,
      date: "2027-01-15",
      startedAt: 0,
      closesAt: 1,
      completedAt: null,
      closedAt: null,
      unreadSentAt: null,
      summarySentAt: null,
    });
    await ctx.db.insert("rotaReads", {
      dayId,
      khatmaId,
      juz: 1,
      slot: 1,
      holderId: participantId,
      readerId: null,
      doneAt: null,
      doneByOrganizer: false,
      reassignedAt: null,
    });
    await ctx.db.insert("notes", {
      personId,
      khatmaId,
      kind: "rotaUnread",
      juz: [1],
      count: null,
      until: null,
      assignmentId: null,
      roundNumber: null,
      createdAt: 0,
      pushedAt: null,
      clearedAt: null,
    });
    await ctx.db.patch(khatmaId, { joinCode: "ABC234" });
    await ctx.db.patch(participantId, {
      joinedAt: 1,
      stoppedAt: null,
      silencedAt: null,
      lastReplyAt: 2,
      silentDays: 0,
    });
    await ctx.db.patch(dayId, { reminderSentAt: 3, celebratedAt: null });
    const readRow = await ctx.db
      .query("rotaReads")
      .withIndex("by_day_juz", (q) => q.eq("dayId", dayId))
      .first();
    await ctx.db.patch(readRow!._id, { notYetAt: 4 });
    await ctx.db.insert("rotaJoinRequests", {
      khatmaId,
      phone: "+966500000005",
      profileName: null,
      createdAt: 0,
      resolvedAt: null,
      outcome: null,
    });
    await ctx.db.insert("waContacts", {
      phone: "+966500000005",
      lastInboundAt: 0,
    });
    await ctx.db.insert("rotaOutbox", {
      khatmaId,
      participantId,
      dayId,
      kind: "juz",
      juz: [1],
      number: null,
      createdAt: 0,
      sentAt: null,
      skippedAt: null,
    });
    await ctx.db.insert("notes", {
      personId,
      khatmaId,
      kind: "rotaSilent",
      name: "x",
      juz: [],
      count: 3,
      until: null,
      assignmentId: null,
      roundNumber: null,
      createdAt: 0,
      pushedAt: null,
      clearedAt: null,
    });
    expect(
      await ctx.db
        .query("khatmas")
        .withIndex("by_joinCode", (q) => q.eq("joinCode", "ABC234"))
        .first(),
    ).toMatchObject({ _id: khatmaId });
    const kinds = await ctx.db
      .query("khatmas")
      .withIndex("by_kind", (q) => q.eq("kind", "rota"))
      .collect();
    expect(kinds).toHaveLength(1);
    await expect(
      ctx.db.insert("khatmas", {
        name: null,
        schedule: "none",
        grace: { value: 7, unit: "days" },
        creatorPersonId: personId,
        inviteCode: "bad",
        completedRounds: 0,
        createdAt: 0,
        // @ts-expect-error only "rota" is a stored kind
        kind: "pool",
      }),
    ).rejects.toThrow();
  });
});
