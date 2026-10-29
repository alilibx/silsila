import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { DEFAULT_GRACE } from "./lib/grace";
import { encodePayload } from "./lib/rotaPayload";
import {
  ROTA_BUTTONS,
  completeText,
  duaText,
  juzText,
} from "./lib/rotaTemplates";
import { enqueue } from "./rotaOutbox";
import schema from "./schema";
import { describeMessage } from "./whatsapp";

const modules = import.meta.glob("./**/*.ts");

const HOUR = 3_600_000;
/** 2027-01-15 12:00 in Asia/Dubai (UTC+4), so awake. */
const NOW = 1_800_000_000_000;
/** 23:00 in Asia/Dubai, so quiet. */
const NIGHT = NOW + 11 * HOUR;
/** 07:00 the next morning in Asia/Dubai, when quiet hours end. */
const MORNING = NIGHT + 8 * HOUR;

type T = TestConvexForDataModel<DataModel>;
let sent: { to: string; text: string }[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WIRDAK_ENV", "dev");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("SITE_URL", "https://wirdak.app");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as { to: string };
      sent.push({ to: payload.to, text: describeMessage(payload) });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const PHONE = "+971500000002";

type Over = Partial<{
  joinedAt: number | null;
  stoppedAt: number | null;
  silencedAt: number | null;
  windowOpen: boolean;
  archivedAt: number | null;
  closedAt: number | null;
  readDone: boolean;
}>;

/** A rota khatma with one participant on slot 2 and one day with juz' 2 and 3 held by them. */
async function setup(t: T, over: Over = {}) {
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
      name: "ختمة العائلة",
      schedule: "none",
      grace: DEFAULT_GRACE.none,
      creatorPersonId: personId,
      inviteCode: "code",
      completedRounds: 0,
      createdAt: 0,
      kind: "rota",
      rota: {
        days: { kind: "daily" },
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
        archivedAt: over.archivedAt ?? null,
      },
    });
    const participantId = await ctx.db.insert("rotaParticipants", {
      khatmaId,
      name: "سارة",
      phone: PHONE,
      personId: null,
      addedAt: 0,
      removedAt: null,
      joinedAt: over.joinedAt === undefined ? NOW - HOUR : over.joinedAt,
      stoppedAt: over.stoppedAt ?? null,
      silencedAt: over.silencedAt ?? null,
    });
    const dayId = await ctx.db.insert("rotaDays", {
      khatmaId,
      n: 1,
      number: 1,
      cycle: 1,
      date: "2027-01-15",
      startedAt: NOW - 4 * HOUR,
      closesAt: NOW + 12 * HOUR,
      completedAt: null,
      closedAt: over.closedAt ?? null,
      unreadSentAt: null,
      summarySentAt: null,
    });
    for (const juz of [2, 3]) {
      await ctx.db.insert("rotaReads", {
        dayId,
        khatmaId,
        juz,
        slot: 2,
        holderId: participantId,
        readerId: participantId,
        doneAt: over.readDone ? NOW - HOUR : null,
        doneByOrganizer: false,
        reassignedAt: null,
      });
    }
    if (over.windowOpen) {
      await ctx.db.insert("waContacts", {
        phone: PHONE,
        lastInboundAt: NOW - HOUR,
      });
    }
    return { khatmaId, participantId, dayId };
  });
}

type Ids = {
  khatmaId: Id<"khatmas">;
  participantId: Id<"rotaParticipants">;
  dayId: Id<"rotaDays">;
};

const queue = (
  t: T,
  ids: Ids,
  kind:
    | "juz"
    | "reminder"
    | "assigned"
    | "covered"
    | "complete"
    | "cycle"
    | "welcome" = "juz",
) =>
  t.run((ctx) =>
    enqueue(ctx, {
      khatmaId: ids.khatmaId,
      participantId: ids.participantId,
      dayId: kind === "welcome" ? null : ids.dayId,
      kind,
      juz: [2, 3],
      number: 1,
    }),
  );

const rows = (t: T) => t.run((ctx) => ctx.db.query("rotaOutbox").collect());

test("enqueue skips a participant who hasn't joined", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { joinedAt: null });
  expect(await queue(t, ids)).toBeNull();
  expect(await rows(t)).toEqual([]);
});

test("enqueue skips a participant who stopped or was silenced", async () => {
  const t = convexTest(schema, modules);
  const stopped = await setup(t, { stoppedAt: NOW - 1 });
  expect(await queue(t, stopped)).toBeNull();
  const silenced = await setup(t, { silencedAt: NOW - 1 });
  expect(await queue(t, silenced)).toBeNull();
  expect(await rows(t)).toEqual([]);
});

test("the same day, kind and participant enqueued twice makes one row", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  expect(await queue(t, ids)).not.toBeNull();
  expect(await queue(t, ids)).toBeNull();
  expect(await rows(t)).toHaveLength(1);
  // A different kind is a different message.
  expect(await queue(t, ids, "reminder")).not.toBeNull();
  expect(await rows(t)).toHaveLength(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test("assigned and covered join an unsent row's ajza', and become a new row once it was sent or skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const add = (kind: "assigned" | "covered", juz: number[]) =>
    t.run((ctx) =>
      enqueue(ctx, {
        khatmaId: ids.khatmaId,
        participantId: ids.participantId,
        dayId: ids.dayId,
        kind,
        juz,
        number: 1,
      }),
    );
  for (const kind of ["assigned", "covered"] as const) {
    const first = await add(kind, [8]);
    expect(await add(kind, [5])).toBe(first);
    expect(await add(kind, [8, 12])).toBe(first);
    const merged = (await rows(t)).filter((r) => r.kind === kind);
    expect(merged.map((r) => r.juz)).toEqual([[5, 8, 12]]);

    await t.run((ctx) => ctx.db.patch(first!, { sentAt: NOW }));
    const second = await add(kind, [20]);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect(
      (await rows(t)).filter((r) => r.kind === kind).map((r) => r.juz),
    ).toEqual([[5, 8, 12], [20]]);

    await t.run((ctx) => ctx.db.patch(second!, { skippedAt: NOW }));
    expect(await add(kind, [21])).not.toBe(second);
  }
  // Other kinds keep the strict dedupe.
  expect(await queue(t, ids, "reminder")).not.toBeNull();
  await t.run((ctx) => ctx.db.patch(ids.dayId, {}));
  expect(await queue(t, ids, "reminder")).toBeNull();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test("rows without a day are never deduplicated", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  const row = {
    khatmaId: ids.khatmaId,
    participantId: ids.participantId,
    dayId: null,
    kind: "cycle" as const,
    juz: [],
    number: null,
  };
  await t.run(async (ctx) => {
    expect(await enqueue(ctx, row)).not.toBeNull();
    expect(await enqueue(ctx, row)).not.toBeNull();
  });
  expect(await rows(t)).toHaveLength(2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
});

test("a juz' message inside the window goes as interactive buttons", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const done = encodePayload(
    { action: "done", dayId: ids.dayId, participantId: ids.participantId },
    false,
  );
  const notYet = encodePayload(
    { action: "notYet", dayId: ids.dayId, participantId: ids.participantId },
    false,
  );
  expect(sent).toEqual([
    {
      to: "971500000002",
      text: `*ختمة العائلة*\nالختمة ١ اليوم. قراءتك: الجزآن ٢ و٣.\n[أتممت] ${done}\n[ليس بعد] ${notYet}`,
    },
  ]);
  expect((await rows(t))[0]?.sentAt).toBeGreaterThanOrEqual(NOW);
});

test("a juz' message outside the window goes as the template with payloads", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await queue(t, ids);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const done = encodePayload(
    { action: "done", dayId: ids.dayId, participantId: ids.participantId },
    false,
  );
  const notYet = encodePayload(
    { action: "notYet", dayId: ids.dayId, participantId: ids.participantId },
    false,
  );
  expect(sent).toEqual([
    {
      to: "971500000002",
      text: `[wirdak_rota_juz] ختمة العائلة | ١ | الجزآن ٢ و٣ | ${done} | ${notYet}`,
    },
  ]);
});

test("staging marks its payloads", async () => {
  vi.stubEnv("SITE_URL", "https://stg.wirdak.app");
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await queue(t, ids);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent[0]?.text).toContain(
    `r1|s|done|${ids.dayId}|${ids.participantId}`,
  );
});

test("a completion message inside the window is the completion line, then the dua, as plain text", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids, "complete");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([
    {
      to: "971500000002",
      text: `*ختمة العائلة*\n${completeText(1)}\n\n${duaText()}`,
    },
  ]);
  expect(completeText(1)).toBe(
    "تحديث على الختمة: اكتملت قراءة الأجزاء الثلاثين في الختمة ١.",
  );
});

test("a completion message outside the window is the template with the dua button", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await queue(t, ids, "complete");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const dua = encodePayload(
    { action: "dua", dayId: ids.dayId, participantId: ids.participantId },
    false,
  );
  expect(sent).toEqual([
    {
      to: "971500000002",
      text: `[wirdak_rota_complete] ختمة العائلة | ١ | ${dua}`,
    },
  ]);
});

test("covered and cycle messages go as their template, or as plain text in the window", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await queue(t, ids, "covered");
  await t.run((ctx) =>
    enqueue(ctx, {
      khatmaId: ids.khatmaId,
      participantId: ids.participantId,
      dayId: null,
      kind: "cycle",
      juz: [],
      number: null,
    }),
  );
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent.map((s) => s.text)).toEqual([
    "[wirdak_rota_covered] ختمة العائلة | الجزأين ٢ و٣",
    "[wirdak_rota_cycle] ختمة العائلة",
  ]);

  sent.length = 0;
  const open = await setup(t, { windowOpen: true });
  await queue(t, open, "covered");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([
    {
      to: "971500000002",
      text: "*ختمة العائلة*\nتحديث على قراءتك: تمّت اليوم قراءة الجزأين ٢ و٣ عنك، فلم يعد عليك شيء منها.",
    },
  ]);
});

test("deliver reschedules during quiet hours and sends once they end", async () => {
  vi.setSystemTime(NIGHT);
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0]?.scheduledTime).toBe(MORNING);
  // Run it early: still quiet, so it reschedules instead of sending.
  const outboxId = (await rows(t))[0]?._id as Id<"rotaOutbox">;
  await t.action(internal.rotaOutbox.deliver, { outboxId });
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.sentAt).toBeNull();
  vi.setSystemTime(MORNING);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
});

test("a reminder for reads already done is skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true, readDone: true });
  await queue(t, ids, "reminder");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  const [row] = await rows(t);
  expect(row?.sentAt).toBeNull();
  expect(row?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("a message for a closed day is skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { closedAt: NOW - 1 });
  await queue(t, ids);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("a message in an archived khatma is skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { archivedAt: NOW - 1 });
  await queue(t, ids, "cycle");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("a participant who stopped after the message was queued is skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  await t.run((ctx) => ctx.db.patch(ids.participantId, { stoppedAt: NOW }));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("a participant removed after the message was queued is skipped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  await t.run((ctx) => ctx.db.patch(ids.participantId, { removedAt: NOW }));
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("enqueue skips a participant who was removed", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await t.run((ctx) => ctx.db.patch(ids.participantId, { removedAt: NOW }));
  expect(await queue(t, ids)).toBeNull();
});

test("a juz' reassigned away before delivery doesn't reach its old reader", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  await t.run(async (ctx) => {
    const other = await ctx.db.insert("rotaParticipants", {
      khatmaId: ids.khatmaId,
      name: "هدى",
      phone: "+971500000003",
      personId: null,
      addedAt: 0,
      removedAt: null,
    });
    for (const read of await ctx.db.query("rotaReads").collect()) {
      await ctx.db.patch(read._id, { readerId: other });
    }
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  expect((await rows(t))[0]?.skippedAt).toBeGreaterThanOrEqual(NOW);
});

test("a juz' still waiting on the participant is sent even when another one was reassigned", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  await t.run(async (ctx) => {
    const read = await ctx.db
      .query("rotaReads")
      .withIndex("by_day_juz", (q) => q.eq("dayId", ids.dayId).eq("juz", 2))
      .unique();
    await ctx.db.patch(read!._id, { readerId: null });
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
});

test("a stop that lands between plan and markSent stops the send", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  const outboxId = (await rows(t))[0]?._id as Id<"rotaOutbox">;
  expect(await t.query(internal.rotaOutbox.plan, { outboxId })).toMatchObject({
    phone: PHONE,
  });
  await t.run((ctx) => ctx.db.patch(ids.participantId, { stoppedAt: NOW }));
  expect(await t.mutation(internal.rotaOutbox.markSent, { outboxId })).toBe(
    false,
  );
  const [row] = await rows(t);
  expect(row?.sentAt).toBeNull();
  expect(row?.skippedAt).toBeGreaterThanOrEqual(NOW);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
});

test("a retried deliver sends once", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids);
  const outboxId = (await rows(t))[0]?._id as Id<"rotaOutbox">;
  await t.action(internal.rotaOutbox.deliver, { outboxId });
  await t.action(internal.rotaOutbox.deliver, { outboxId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
  expect((await rows(t))[0]?.skippedAt).toBeNull();
});

test("a welcome inside the window goes free-form with today's juz' and the buttons", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  expect(await queue(t, ids, "welcome")).not.toBeNull();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
  const text = sent[0]?.text ?? "";
  expect(sent[0]?.to).toBe(PHONE.slice(1));
  expect(text).toContain("*ختمة العائلة*");
  expect(text).toContain("أهلاً سارة");
  expect(text).toContain(juzText(1, [2, 3]));
  expect(text).toContain(`[${ROTA_BUTTONS.done}]`);
  expect(text).toContain(`[${ROTA_BUTTONS.notYet}]`);
  expect((await rows(t))[0]?.sentAt).not.toBeNull();
});

test("a welcome with no juz' to read today says when the next day comes", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true, readDone: true });
  await queue(t, ids, "welcome");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.text).toContain("أهلاً سارة");
  expect(sent[0]?.text).toContain("تصلك رسالة جزئك يوم");
  expect(sent[0]?.text).not.toContain(`[${ROTA_BUTTONS.done}]`);
});

test("a welcome outside the window is skipped: there is no template, the next juz' message follows", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t);
  await queue(t, ids, "welcome");
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toEqual([]);
  const [row] = await rows(t);
  expect(row?.sentAt).toBeNull();
  expect(row?.skippedAt).not.toBeNull();
});

test("a welcome waits for quiet hours to end", async () => {
  vi.setSystemTime(NIGHT);
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true, readDone: true });
  // They wrote just now (the setup's window opened at noon), so it is still open in the morning.
  await t.run(async (ctx) => {
    const contact = await ctx.db.query("waContacts").first();
    await ctx.db.patch(contact!._id, { lastInboundAt: NIGHT });
  });
  await queue(t, ids, "welcome");
  const outboxId = (await rows(t))[0]?._id as Id<"rotaOutbox">;
  await t.action(internal.rotaOutbox.deliver, { outboxId });
  expect(sent).toEqual([]);
  vi.setSystemTime(MORNING);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sent).toHaveLength(1);
});

test("welcomes are never merged or deduped", async () => {
  const t = convexTest(schema, modules);
  const ids = await setup(t, { windowOpen: true });
  await queue(t, ids, "welcome");
  await queue(t, ids, "welcome");
  expect(await rows(t)).toHaveLength(2);
});

test("sendSample sends every rota template, only on dev or staging", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.rotaOutbox.sendSample, { phone: PHONE });
  expect(sent.map((s) => s.text.split("]")[0])).toEqual([
    "[wirdak_rota_juz",
    "[wirdak_rota_reminder",
    "[wirdak_rota_assigned",
    "[wirdak_rota_covered",
    "[wirdak_rota_complete",
    "[wirdak_rota_cycle",
  ]);
  vi.stubEnv("WIRDAK_ENV", "prod");
  await expect(
    t.action(internal.rotaOutbox.sendSample, { phone: PHONE }),
  ).rejects.toThrow();
});
