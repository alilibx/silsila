import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { checkRateLimit } from "./lib/rateLimit";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function verification(createdAt: number, code: string) {
  return {
    codeNormalized: code,
    secretHash: "h",
    displayName: "x",
    status: "pending" as const,
    pinAttempts: 0,
    createdAt,
    expiresAt: createdAt + 600_000,
  };
}

test("purge deletes old messages and verifications and keeps recent ones", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("inboundMessages", {
      waMessageId: "old",
      receivedAt: NOW - 8 * 24 * HOUR,
    });
    await ctx.db.insert("inboundMessages", {
      waMessageId: "mid",
      receivedAt: NOW - 25 * HOUR,
    });
    await ctx.db.insert("inboundMessages", {
      waMessageId: "new",
      receivedAt: NOW - HOUR,
    });
    await ctx.db.insert("verifications", verification(NOW - 25 * HOUR, "OLD"));
    await ctx.db.insert("verifications", verification(NOW - HOUR, "NEW"));
  });

  await t.mutation(internal.maintenance.purge, {});

  await t.run(async (ctx) => {
    // inbound messages are kept for 7 days: only the 8-day-old one goes
    expect(
      (await ctx.db.query("inboundMessages").collect())
        .map((r) => r.waMessageId)
        .sort(),
    ).toEqual(["mid", "new"]);
    expect(
      (await ctx.db.query("verifications").collect()).map(
        (r) => r.codeNormalized,
      ),
    ).toEqual(["NEW"]);
  });
});

test("purge removes expired rate-limit windows and keeps live ones", async () => {
  const MIN = 60_000;
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // 10-minute window that expired ~50 minutes ago (started 1h ago)
    await ctx.db.insert("rateLimits", {
      key: "ip:expired10min",
      windowStart: NOW - HOUR,
      expiresAt: NOW - HOUR + 10 * MIN,
      count: 3,
    });
    // still-open 10-minute window
    await ctx.db.insert("rateLimits", {
      key: "ip:live10min",
      windowStart: NOW - 5 * MIN,
      expiresAt: NOW + 5 * MIN,
      count: 1,
    });
    // 24h window opened 20h ago (createsPerPersonPerDay style): still live
    await ctx.db.insert("rateLimits", {
      key: "person:live24h",
      windowStart: NOW - 20 * HOUR,
      expiresAt: NOW + 4 * HOUR,
      count: 4,
    });
    // boundary: expiresAt === now is kept (purge uses expiresAt < now)...
    await ctx.db.insert("rateLimits", {
      key: "at-boundary",
      windowStart: NOW - MIN,
      expiresAt: NOW,
      count: 1,
    });
    // ...and one millisecond earlier is purged
    await ctx.db.insert("rateLimits", {
      key: "just-expired",
      windowStart: NOW - MIN,
      expiresAt: NOW - 1,
      count: 1,
    });
  });

  await t.mutation(internal.maintenance.purge, {});

  await t.run(async (ctx) => {
    expect(
      (await ctx.db.query("rateLimits").collect()).map((r) => r.key).sort(),
    ).toEqual(["at-boundary", "ip:live10min", "person:live24h"]);
  });
});

test("rate-limit rows record expiresAt = windowStart + windowMs", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await checkRateLimit(ctx, "k", 1, 600_000);
    const [row] = await ctx.db.query("rateLimits").collect();
    expect(row?.windowStart).toBe(NOW);
    expect(row?.expiresAt).toBe(NOW + 600_000);
  });
});

test("purge is bounded per run and reschedules itself while a backlog remains", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 501; i++) {
      await ctx.db.insert("rateLimits", {
        key: `k${i}`,
        windowStart: NOW - 30 * HOUR,
        expiresAt: NOW - 29 * HOUR,
        count: 1,
      });
    }
  });

  await t.mutation(internal.maintenance.purge, {});
  await t.run(async (ctx) => {
    expect(await ctx.db.query("rateLimits").collect()).toHaveLength(1);
  });

  // the follow-up run (scheduled by the first) clears the remainder
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await t.run(async (ctx) => {
    expect(await ctx.db.query("rateLimits").collect()).toHaveLength(0);
  });
});

test("purge does not reschedule when nothing is left over", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("rateLimits", {
      key: "old",
      windowStart: NOW - 30 * HOUR,
      expiresAt: NOW - 29 * HOUR,
      count: 1,
    });
  });
  await t.mutation(internal.maintenance.purge, {});
  const scheduled = await t.run(async (ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toHaveLength(0);
});

type Base = {
  personId: Id<"people">;
  sessionId: Id<"sessions">;
  khatmaId: Id<"khatmas">;
};

/** A person, session, and khatma to hang notes and hand-off tokens on. */
function seedBase(t: ReturnType<typeof convexTest>): Promise<Base> {
  return t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", {
      phone: "+971500000001",
      displayName: "علي",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: NOW,
    });
    const sessionId = await ctx.db.insert("sessions", {
      personId,
      tokenHash: "t",
      alertTokenHash: "a",
      deviceLabel: "x",
      createdAt: NOW,
      lastUsedAt: NOW,
    });
    const khatmaId = await ctx.db.insert("khatmas", {
      name: null,
      schedule: "weekly",
      grace: { value: 2, unit: "days" },
      creatorPersonId: personId,
      inviteCode: "invite000001",
      completedRounds: 0,
      createdAt: NOW,
    });
    return { personId, sessionId, khatmaId };
  });
}

const insertNote = (
  ctx: MutationCtx,
  base: Base,
  createdAt: number,
  clearedAt: number | null,
) =>
  ctx.db.insert("notes", {
    personId: base.personId,
    khatmaId: base.khatmaId,
    kind: "completed",
    juz: [],
    count: null,
    until: null,
    assignmentId: null,
    roundNumber: null,
    createdAt,
    pushedAt: null,
    clearedAt,
  });

test("purge deletes hand-off tokens older than a day and keeps newer ones", async () => {
  const t = convexTest(schema, modules);
  const base = await seedBase(t);
  const ids = await t.run(async (ctx) => {
    const token = (tokenHash: string, createdAt: number) =>
      ctx.db.insert("handoffTokens", {
        tokenHash,
        personId: base.personId,
        sessionId: base.sessionId,
        createdAt,
        expiresAt: createdAt + 1800_000,
        usedAt: null,
      });
    return {
      oldToken: await token("old", NOW - 25 * HOUR),
      newToken: await token("new", NOW - 23 * HOUR),
    };
  });

  await t.mutation(internal.maintenance.purge, {});
  await t.run(async (ctx) => {
    expect(await ctx.db.get(ids.oldToken)).toBeNull();
    expect(await ctx.db.get(ids.newToken)).not.toBeNull();
  });
});

test("purge keeps uncleared notes past 30 days and deletes notes cleared more than 30 days ago", async () => {
  const DAY = 24 * HOUR;
  const t = convexTest(schema, modules);
  const base = await seedBase(t);
  const ids = await t.run(async (ctx) => ({
    // a monthly round's "behind" note: old, but its round is still going
    uncleared40: await insertNote(ctx, base, NOW - 40 * DAY, null),
    cleared31: await insertNote(ctx, base, NOW - 45 * DAY, NOW - 31 * DAY),
    cleared29: await insertNote(ctx, base, NOW - 45 * DAY, NOW - 29 * DAY),
    uncleared181: await insertNote(ctx, base, NOW - 181 * DAY, null),
    uncleared179: await insertNote(ctx, base, NOW - 179 * DAY, null),
  }));

  await t.mutation(internal.maintenance.purge, {});
  await t.run(async (ctx) => {
    expect(await ctx.db.get(ids.uncleared40)).not.toBeNull();
    expect(await ctx.db.get(ids.cleared31)).toBeNull();
    expect(await ctx.db.get(ids.cleared29)).not.toBeNull();
    expect(await ctx.db.get(ids.uncleared181)).toBeNull();
    expect(await ctx.db.get(ids.uncleared179)).not.toBeNull();
  });
});

test("a note past both cutoffs is deleted once, not twice", async () => {
  const DAY = 24 * HOUR;
  const t = convexTest(schema, modules);
  const base = await seedBase(t);
  const id = await t.run((ctx) =>
    insertNote(ctx, base, NOW - 200 * DAY, NOW - 40 * DAY),
  );
  await t.mutation(internal.maintenance.purge, {});
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row).toBeNull();
});

test("purge deletes audit rows after two years and expired admin sessions", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const AUDIT_TTL_MS = 2 * 365 * 86_400_000;
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", {
      phone: "+971500000001",
      addedBy: null,
      addedAt: 0,
    }),
  );
  const audit = (at: number) =>
    t.run((ctx) =>
      ctx.db.insert("auditLog", {
        adminId,
        adminPhone: "+971500000001",
        action: "setting.set",
        targetKind: "setting",
        targetId: "maxMembers",
        before: 60,
        after: 40,
        note: null,
        at,
      }),
    );
  const session = (expiresAt: number) =>
    t.run((ctx) =>
      ctx.db.insert("adminSessions", {
        adminId,
        tokenHash: `h${expiresAt}`,
        alertTokenHash: `a${expiresAt}`,
        deviceLabel: "iPhone",
        createdAt: expiresAt - 1,
        expiresAt,
      }),
    );
  const oldAudit = await audit(now - AUDIT_TTL_MS - 60_000);
  const keptAudit = await audit(now - AUDIT_TTL_MS + 60_000);
  const expired = await session(now - 60_000);
  const live = await session(now + 60_000);

  await t.mutation(internal.maintenance.purge, {});

  await t.run(async (ctx) => {
    expect(await ctx.db.get(oldAudit)).toBeNull();
    expect(await ctx.db.get(keptAudit)).not.toBeNull();
    expect(await ctx.db.get(expired)).toBeNull();
    expect(await ctx.db.get(live)).not.toBeNull();
  });
});

async function closedHelpRequest(
  t: ReturnType<typeof convexTest>,
  closedAt: number,
) {
  return await t.run(async (ctx) => {
    const shot = await ctx.storage.store(
      new Blob([new Uint8Array(10)], { type: "image/png" }),
    );
    const requestId = await ctx.db.insert("helpRequests", {
      personId: null,
      reporterHash: "h",
      khatmaId: null,
      status: "closed",
      context: {
        path: "/",
        appVersion: "",
        userAgent: "",
        screen: "",
        timeZone: "",
      },
      createdAt: closedAt - 1000,
      lastMessageAt: closedAt - 1000,
      answeredAt: null,
      closedAt,
      seenAt: null,
      attachmentsDeletedAt: null,
    });
    const messageId = await ctx.db.insert("helpMessages", {
      requestId,
      from: "visitor",
      text: "نص",
      screenshotId: shot,
      voiceId: null,
      voiceSeconds: null,
      createdAt: closedAt - 1000,
    });
    return { requestId, messageId, shot };
  });
}

test("purge deletes help files after 30 days and conversations after 180", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const DAY_MS = 86_400_000;
  const recent = await closedHelpRequest(t, now - 29 * DAY_MS);
  const filesGone = await closedHelpRequest(t, now - 30 * DAY_MS - 60_000);
  const allGone = await closedHelpRequest(t, now - 180 * DAY_MS - 60_000);

  await t.mutation(internal.maintenance.purge, {});

  await t.run(async (ctx) => {
    expect(await ctx.db.system.get(recent.shot)).not.toBeNull();

    expect(await ctx.db.system.get(filesGone.shot)).toBeNull();
    expect(await ctx.db.get(filesGone.messageId)).toMatchObject({
      text: "نص",
      screenshotId: null,
    });
    expect(
      (await ctx.db.get(filesGone.requestId))?.attachmentsDeletedAt,
    ).not.toBeNull();

    expect(await ctx.db.get(allGone.requestId)).toBeNull();
    expect(await ctx.db.get(allGone.messageId)).toBeNull();
    expect(await ctx.db.system.get(allGone.shot)).toBeNull();
  });
});

test("purge deletes uploads never attached, after an hour", async () => {
  const t = convexTest(schema, modules);
  const orphan = await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(5)], { type: "image/png" })),
  );
  const attached = await closedHelpRequest(t, Date.now() + 1);

  vi.setSystemTime(Date.now() + 59 * 60_000);
  await t.mutation(internal.maintenance.purge, {});
  expect(await t.run((ctx) => ctx.db.system.get(orphan))).not.toBeNull();

  vi.setSystemTime(Date.now() + 2 * 60_000);
  await t.mutation(internal.maintenance.purge, {});
  expect(await t.run((ctx) => ctx.db.system.get(orphan))).toBeNull();
  expect(await t.run((ctx) => ctx.db.system.get(attached.shot))).not.toBeNull();
});
