import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { notify } from "./notes";
import {
  addDays,
  cycleOf,
  isReadingDate,
  khatmaNumber,
  ROTA_SIZE,
  slotFor,
} from "./lib/rota";
import { slotRowsByJuz } from "./lib/rotaPlace";
import { instantAt, localDate, localMinutes } from "./lib/wakingTime";

type RotaConfig = NonNullable<Doc<"khatmas">["rota"]>;

/** Sets `completedAt` when all 30 reads are done. Returns whether it just completed. */
export async function completeIfDone(
  ctx: MutationCtx,
  dayId: Id<"rotaDays">,
): Promise<boolean> {
  const day = await ctx.db.get(dayId);
  if (!day || day.completedAt !== null) return false;
  const reads = await ctx.db
    .query("rotaReads")
    .withIndex("by_day_juz", (q) => q.eq("dayId", dayId))
    .collect();
  if (reads.length < ROTA_SIZE || reads.some((r) => r.doneAt === null)) {
    return false;
  }
  await ctx.db.patch(dayId, { completedAt: Date.now() });
  return true;
}

/** The latest reading day of the khatma, which is the only one that can be open. */
function lastDay(
  ctx: MutationCtx,
  khatmaId: Id<"khatmas">,
): Promise<Doc<"rotaDays"> | null> {
  return ctx.db
    .query("rotaDays")
    .withIndex("by_khatma_n", (q) => q.eq("khatmaId", khatmaId))
    .order("desc")
    .first();
}

/** Whether a day should start now: its date is a reading date that has no day yet. */
async function shouldStart(
  ctx: MutationCtx,
  khatma: Doc<"khatmas">,
  rota: RotaConfig,
  today: string,
  now: number,
): Promise<boolean> {
  if (rota.pausedAt !== null) return false;
  if (rota.endDate !== null && today > rota.endDate) return false;
  if (!isReadingDate(rota.days, rota.firstDate, today)) return false;
  if (rota.pauseDates.includes(today)) return false;
  if (localMinutes(now, rota.timeZone) < rota.messages.dayAt) return false;
  const started = await ctx.db
    .query("rotaDays")
    .withIndex("by_khatma_date", (q) =>
      q.eq("khatmaId", khatma._id).eq("date", today),
    )
    .first();
  return started === null;
}

async function startDay(
  ctx: MutationCtx,
  khatma: Doc<"khatmas">,
  rota: RotaConfig,
  last: Doc<"rotaDays"> | null,
  today: string,
  now: number,
): Promise<Doc<"rotaDays">> {
  const n = (last?.n ?? 0) + 1;
  const number = khatmaNumber(n);
  const dayId = await ctx.db.insert("rotaDays", {
    khatmaId: khatma._id,
    n,
    number,
    cycle: cycleOf(n),
    date: today,
    startedAt: now,
    closesAt: instantAt(addDays(today, 1), rota.messages.dayAt, rota.timeZone),
    completedAt: null,
    closedAt: null,
    unreadSentAt: null,
    summarySentAt: null,
  });
  const byJuz = await slotRowsByJuz(ctx, khatma._id, number);
  for (let juz = 1; juz <= ROTA_SIZE; juz++) {
    const slot = slotFor(juz, number);
    const holderId = byJuz.get(juz)?.participantId ?? null;
    await ctx.db.insert("rotaReads", {
      dayId,
      khatmaId: khatma._id,
      juz,
      slot,
      holderId,
      readerId: holderId,
      doneAt: null,
      doneByOrganizer: false,
      reassignedAt: null,
    });
  }
  const day = await ctx.db.get(dayId);
  if (!day) throw new Error("rota day vanished");
  return day;
}

/** The organizer's unread list and summary, once each, on the day dated today. */
async function sendOrganizerNotes(
  ctx: MutationCtx,
  khatma: Doc<"khatmas">,
  rota: RotaConfig,
  day: Doc<"rotaDays">,
  now: number,
): Promise<void> {
  const minutes = localMinutes(now, rota.timeZone);
  const { unread, summary } = rota.messages;
  const wantsUnread =
    unread.on &&
    minutes >= unread.at &&
    day.unreadSentAt === null &&
    day.completedAt === null;
  const wantsSummary =
    summary.on && minutes >= summary.at && day.summarySentAt === null;
  if (!wantsUnread && !wantsSummary) return;

  const reads = await ctx.db
    .query("rotaReads")
    .withIndex("by_day_juz", (q) => q.eq("dayId", day._id))
    .collect();
  if (wantsUnread) {
    const juz = reads.filter((r) => r.doneAt === null).map((r) => r.juz);
    if (juz.length > 0) {
      await notify(ctx, {
        personId: khatma.creatorPersonId,
        khatmaId: khatma._id,
        kind: "rotaUnread",
        juz,
      });
    }
    await ctx.db.patch(day._id, { unreadSentAt: now });
  }
  if (wantsSummary) {
    const done = reads.filter((r) => r.doneAt !== null);
    await notify(ctx, {
      personId: khatma.creatorPersonId,
      khatmaId: khatma._id,
      kind: "rotaSummary",
      count: done.length,
      juz: done.map((r) => r.juz),
    });
    await ctx.db.patch(day._id, { summarySentAt: now });
  }
}

/**
 * Moves one rota khatma forward: closes the open day when it is due, starts
 * today's day, sends the organizer's notes and archives a finished khatma.
 * Every step is safe to repeat.
 */
export const tick = internalMutation({
  args: { khatmaId: v.id("khatmas") },
  handler: async (ctx, args) => {
    const khatma = await ctx.db.get(args.khatmaId);
    const rota = khatma?.rota;
    if (!khatma || khatma.kind !== "rota" || !rota) return;
    if (rota.archivedAt !== null) return;
    const now = Date.now();
    const today = localDate(now, rota.timeZone);

    let last = await lastDay(ctx, khatma._id);
    if (last && last.closedAt === null && now >= last.closesAt) {
      await ctx.db.patch(last._id, { closedAt: now });
      last = { ...last, closedAt: now };
    }

    if (await shouldStart(ctx, khatma, rota, today, now)) {
      if (last && last.closedAt === null) {
        await ctx.db.patch(last._id, { closedAt: now });
      }
      last = await startDay(ctx, khatma, rota, last, today, now);
    }

    if (last && last.closedAt === null && last.date === today) {
      await sendOrganizerNotes(ctx, khatma, rota, last, now);
    }

    const open = last !== null && last.closedAt === null;
    if (rota.endDate !== null && today > rota.endDate && !open) {
      await ctx.db.patch(khatma._id, { rota: { ...rota, archivedAt: now } });
    }
  },
});

/** Every 15 minutes: ticks each rota khatma that is not archived. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const khatmas = await ctx.db
      .query("khatmas")
      .withIndex("by_kind", (q) => q.eq("kind", "rota"))
      .collect();
    for (const khatma of khatmas) {
      if (khatma.rota && khatma.rota.archivedAt === null) {
        await ctx.scheduler.runAfter(0, internal.rotaDays.tick, {
          khatmaId: khatma._id,
        });
      }
    }
  },
});
