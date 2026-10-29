import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { organizerOf, requireOrganizer } from "./organizer";
import { randomToken } from "./lib/crypto";
import { DEFAULT_GRACE } from "./lib/grace";
import { checkRateLimit } from "./lib/rateLimit";
import {
  addDays,
  isReadingDate,
  isValidReadingDays,
  readingDaysValidator,
  ROTA_SIZE,
  slotFor,
  type RotaMessages,
} from "./lib/rota";
import { slotRowsByJuz, targetDay } from "./lib/rotaPlace";
import type { SessionContext } from "./lib/session";
import { sessionMutation, sessionQuery } from "./lib/session";
import { getSetting } from "./lib/settings";
import { cleanDisplayName, cleanKhatmaName, normalizePhone } from "./lib/text";
import { localDate } from "./lib/wakingTime";

const DAY_MS = 86_400_000;
/** Attempts at drawing an unused invite code; a collision is ~1e-20 likely. */
const INVITE_CODE_ATTEMPTS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date written `YYYY-MM-DD`. */
function isDate(date: string): boolean {
  return DATE_RE.test(date) && addDays(date, 0) === date;
}

// ---------------------------------------------------------------------------
// Create

/** How many rota khatmas the person organizes that are not archived. */
async function activeRotaCount(
  ctx: QueryCtx,
  personId: Id<"people">,
): Promise<number> {
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .collect();
  let count = 0;
  for (const member of memberships) {
    const khatma = await ctx.db.get(member.khatmaId);
    if (
      khatma?.kind === "rota" &&
      khatma.creatorPersonId === personId &&
      khatma.rota?.archivedAt === null
    ) {
      count += 1;
    }
  }
  return count;
}

async function defaultMessages(ctx: QueryCtx): Promise<RotaMessages> {
  return {
    dayAt: await getSetting(ctx, "rotaDayAt"),
    reminder: {
      at: await getSetting(ctx, "rotaReminderAt"),
      on: await getSetting(ctx, "rotaReminderOn"),
    },
    unread: {
      at: await getSetting(ctx, "rotaUnreadAt"),
      on: await getSetting(ctx, "rotaUnreadOn"),
    },
    summary: {
      at: await getSetting(ctx, "rotaSummaryAt"),
      on: await getSetting(ctx, "rotaSummaryOn"),
    },
  };
}

/**
 * Inserts a rota khatma, the organizer's membership, and the organizer as
 * participant 1 on slot 1 atomically. `null` on invite-code collision.
 */
export const insertRota = internalMutation({
  args: {
    personId: v.id("people"),
    name: v.string(),
    days: readingDaysValidator,
    firstDate: v.string(),
    endDate: v.union(v.string(), v.null()),
    inviteCode: v.string(),
    shareToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ inviteCode: string } | null> => {
    if (await getSetting(ctx, "maintenanceMode")) {
      throw new ConvexError({ code: "maintenance" });
    }
    const person = await ctx.db.get(args.personId);
    if (!person) throw new ConvexError({ code: "not_signed_in" });
    if (person.rotaAllowed !== true) {
      throw new ConvexError({ code: "rota_not_allowed" });
    }
    if (
      (await activeRotaCount(ctx, person._id)) >=
      (await getSetting(ctx, "rotaMaxActivePerOrganizer"))
    ) {
      throw new ConvexError({ code: "rota_cap" });
    }
    if (!isValidReadingDays(args.days)) {
      throw new ConvexError({ code: "invalid_days" });
    }
    const today = localDate(Date.now(), person.timeZone);
    if (
      !isDate(args.firstDate) ||
      args.firstDate < today ||
      (args.endDate !== null &&
        (!isDate(args.endDate) || args.endDate < args.firstDate)) ||
      !isReadingDate(args.days, args.firstDate, args.firstDate)
    ) {
      throw new ConvexError({ code: "invalid_dates" });
    }

    const taken = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.inviteCode))
      .first();
    if (taken) return null;

    const allowed = await checkRateLimit(
      ctx,
      `khatmaCreate:${person._id}`,
      await getSetting(ctx, "createsPerPersonPerDay"),
      DAY_MS,
    );
    if (!allowed) throw new ConvexError({ code: "rate_limited" });

    const now = Date.now();
    const khatmaId = await ctx.db.insert("khatmas", {
      name: args.name,
      schedule: "none",
      grace: DEFAULT_GRACE.none,
      creatorPersonId: person._id,
      inviteCode: args.inviteCode,
      completedRounds: 0,
      createdAt: now,
      kind: "rota",
      rota: {
        days: args.days,
        firstDate: args.firstDate,
        endDate: args.endDate,
        timeZone: person.timeZone,
        messages: await defaultMessages(ctx),
        pausedAt: null,
        pauseDates: [],
        archivedAt: null,
      },
    });
    await ctx.db.insert("members", {
      khatmaId,
      personId: person._id,
      joinedAt: now,
      shareToken: args.shareToken,
      status: "active",
      notificationsOn: true,
      lastNudgeAt: null,
      lastCelebratedRound: 0,
    });
    const participantId = await ctx.db.insert("rotaParticipants", {
      khatmaId,
      name: person.displayName,
      phone: person.phone,
      personId: person._id,
      addedAt: now,
      removedAt: null,
    });
    await ctx.db.insert("rotaSlots", { khatmaId, slot: 1, participantId });
    // A khatma made after its first day's start time starts that day now.
    await ctx.scheduler.runAfter(0, internal.rotaDays.tick, { khatmaId });
    return { inviteCode: args.inviteCode };
  },
});

export const create = action({
  args: {
    sessionToken: v.optional(v.string()),
    name: v.string(),
    days: readingDaysValidator,
    firstDate: v.string(),
    endDate: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args): Promise<{ inviteCode: string }> => {
    const personId = await ctx.runQuery(internal.khatmas.personIdForToken, {
      sessionToken: args.sessionToken,
    });
    if (!personId) throw new ConvexError({ code: "not_signed_in" });
    const name = cleanKhatmaName(args.name);
    if (name === null) throw new ConvexError({ code: "invalid_name" });
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      const created = await ctx.runMutation(internal.rota.insertRota, {
        personId,
        name,
        days: args.days,
        firstDate: args.firstDate,
        endDate: args.endDate,
        inviteCode: randomToken(9),
        shareToken: randomToken(8),
      });
      if (created) return created;
    }
    throw new Error("could not allocate an invite code");
  },
});

// ---------------------------------------------------------------------------
// People

/** The organizer and their rota khatma, or `forbidden` (also for a pool khatma). */
async function requireRotaOrganizer(
  ctx: MutationCtx & SessionContext,
  inviteCode: string,
): Promise<{ person: Doc<"people">; khatma: Doc<"khatmas"> }> {
  const found = await requireOrganizer(ctx, inviteCode);
  if (found.khatma.kind !== "rota")
    throw new ConvexError({ code: "forbidden" });
  return found;
}

/** An active participant of the khatma, or null. */
async function activeParticipant(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  participantId: Id<"rotaParticipants">,
): Promise<Doc<"rotaParticipants"> | null> {
  const participant = await ctx.db.get(participantId);
  return participant &&
    participant.khatmaId === khatmaId &&
    participant.removedAt === null
    ? participant
    : null;
}

function isJuz(juz: number): boolean {
  return Number.isInteger(juz) && juz >= 1 && juz <= ROTA_SIZE;
}

type PeopleView = {
  target: { number: number; date: string | null; isFirst: boolean };
  rows: {
    juz: number;
    participant: {
      id: Id<"rotaParticipants">;
      name: string;
      isMe: boolean;
      slots: number;
    } | null;
  }[];
  participants: {
    id: Id<"rotaParticipants">;
    name: string;
    isMe: boolean;
    juz: number[];
  }[];
  freeJuz: number[];
  maxSlots: number;
};

/** Everyone in the khatma and who holds which juz' of the next day to start. Organizer only. */
export const people = sessionQuery({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<PeopleView | null> => {
    const found = await organizerOf(ctx, args.inviteCode, ctx.person);
    if (!found || found.khatma.kind !== "rota") return null;
    const { person, khatma } = found;
    const target = await targetDay(ctx, khatma);
    const byJuz = await slotRowsByJuz(ctx, khatma._id, target.number);
    const participants = (
      await ctx.db
        .query("rotaParticipants")
        .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
        .collect()
    )
      .filter((p) => p.removedAt === null)
      .sort(
        (a, b) => a.addedAt - b.addedAt || a._creationTime - b._creationTime,
      );
    const heldBy = new Map<Id<"rotaParticipants">, number[]>();
    for (let juz = 1; juz <= ROTA_SIZE; juz++) {
      const row = byJuz.get(juz);
      if (!row) continue;
      heldBy.set(row.participantId, [
        ...(heldBy.get(row.participantId) ?? []),
        juz,
      ]);
    }
    const byId = new Map(participants.map((p) => [p._id, p]));
    const isMe = (p: Doc<"rotaParticipants">) => p.personId === person._id;
    return {
      target: {
        number: target.number,
        date: target.date,
        isFirst: target.n === 1,
      },
      rows: Array.from({ length: ROTA_SIZE }, (_, i) => {
        const juz = i + 1;
        const holderId = byJuz.get(juz)?.participantId;
        const holder = holderId ? byId.get(holderId) : undefined;
        return {
          juz,
          participant: holder
            ? {
                id: holder._id,
                name: holder.name,
                isMe: isMe(holder),
                slots: heldBy.get(holder._id)?.length ?? 0,
              }
            : null,
        };
      }),
      participants: participants.map((p) => ({
        id: p._id,
        name: p.name,
        isMe: isMe(p),
        juz: heldBy.get(p._id) ?? [],
      })),
      freeJuz: Array.from({ length: ROTA_SIZE }, (_, i) => i + 1).filter(
        (juz) => !byJuz.has(juz),
      ),
      maxSlots: await getSetting(ctx, "rotaMaxSlotsPerPerson"),
    };
  },
});

export const addParticipant = sessionMutation({
  args: {
    inviteCode: v.string(),
    name: v.string(),
    phone: v.string(),
    juz: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; participantId: Id<"rotaParticipants">; juz: number }
    | {
        error:
          | "bad_name"
          | "bad_phone"
          | "no_free_juz"
          | "juz_taken"
          | "already_added";
      }
  > => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const name = cleanDisplayName(args.name);
    if (name === null) return { error: "bad_name" };
    const phone = normalizePhone(args.phone);
    if (phone === null) return { error: "bad_phone" };
    const same = await ctx.db
      .query("rotaParticipants")
      .withIndex("by_khatma_phone", (q) =>
        q.eq("khatmaId", khatma._id).eq("phone", phone),
      )
      .collect();
    if (same.some((p) => p.removedAt === null)) {
      return { error: "already_added" };
    }

    const target = await targetDay(ctx, khatma);
    const byJuz = await slotRowsByJuz(ctx, khatma._id, target.number);
    let juz = args.juz;
    if (juz === undefined) {
      juz = Array.from({ length: ROTA_SIZE }, (_, i) => i + 1).find(
        (j) => !byJuz.has(j),
      );
      if (juz === undefined) return { error: "no_free_juz" };
    } else if (!isJuz(juz)) {
      throw new ConvexError({ code: "invalid_juz" });
    } else if (byJuz.has(juz)) {
      return { error: "juz_taken" };
    }

    const participantId = await ctx.db.insert("rotaParticipants", {
      khatmaId: khatma._id,
      name,
      phone,
      personId: null,
      addedAt: Date.now(),
      removedAt: null,
    });
    await ctx.db.insert("rotaSlots", {
      khatmaId: khatma._id,
      slot: slotFor(juz, target.number),
      participantId,
    });
    return { ok: true, participantId, juz };
  },
});

export const giveJuz = sessionMutation({
  args: {
    inviteCode: v.string(),
    participantId: v.id("rotaParticipants"),
    juz: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true } | { error: "juz_taken" | "too_many" | "not_found" }
  > => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const participant = await activeParticipant(
      ctx,
      khatma._id,
      args.participantId,
    );
    if (!participant || !isJuz(args.juz)) return { error: "not_found" };
    const target = await targetDay(ctx, khatma);
    const byJuz = await slotRowsByJuz(ctx, khatma._id, target.number);
    if (byJuz.has(args.juz)) return { error: "juz_taken" };
    const held = await ctx.db
      .query("rotaSlots")
      .withIndex("by_participant", (q) =>
        q.eq("participantId", participant._id),
      )
      .collect();
    if (held.length >= (await getSetting(ctx, "rotaMaxSlotsPerPerson"))) {
      return { error: "too_many" };
    }
    await ctx.db.insert("rotaSlots", {
      khatmaId: khatma._id,
      slot: slotFor(args.juz, target.number),
      participantId: participant._id,
    });
    return { ok: true };
  },
});

export const moveJuz = sessionMutation({
  args: {
    inviteCode: v.string(),
    participantId: v.id("rotaParticipants"),
    fromJuz: v.number(),
    toJuz: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    if (!isJuz(args.fromJuz) || !isJuz(args.toJuz)) {
      return { error: "not_found" };
    }
    const target = await targetDay(ctx, khatma);
    const byJuz = await slotRowsByJuz(ctx, khatma._id, target.number);
    const from = byJuz.get(args.fromJuz);
    if (!from || from.participantId !== args.participantId) {
      return { error: "not_found" };
    }
    const to = byJuz.get(args.toJuz);
    if (to) {
      // Swap holders; the slots stay where they are.
      await ctx.db.patch(from._id, { participantId: to.participantId });
      await ctx.db.patch(to._id, { participantId: from.participantId });
    } else {
      await ctx.db.patch(from._id, {
        slot: slotFor(args.toJuz, target.number),
      });
    }
    return { ok: true };
  },
});

export const freeJuz = sessionMutation({
  args: { inviteCode: v.string(), juz: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    if (!isJuz(args.juz)) return { error: "not_found" };
    const target = await targetDay(ctx, khatma);
    const row = (await slotRowsByJuz(ctx, khatma._id, target.number)).get(
      args.juz,
    );
    if (!row) return { error: "not_found" };
    await ctx.db.delete(row._id);
    return { ok: true };
  },
});

export const removeParticipant = sessionMutation({
  args: {
    inviteCode: v.string(),
    participantId: v.id("rotaParticipants"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" | "is_me" }> => {
    const { person, khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const participant = await activeParticipant(
      ctx,
      khatma._id,
      args.participantId,
    );
    if (!participant) return { error: "not_found" };
    if (participant.personId === person._id) return { error: "is_me" };
    const slots = await ctx.db
      .query("rotaSlots")
      .withIndex("by_participant", (q) =>
        q.eq("participantId", participant._id),
      )
      .collect();
    for (const slot of slots) await ctx.db.delete(slot._id);
    // Today's reads keep their reader: only the slots go.
    await ctx.db.patch(participant._id, { removedAt: Date.now() });
    return { ok: true };
  },
});
