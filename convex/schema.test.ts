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
