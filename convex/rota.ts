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
import { khatmaJoinLink, randomJoinCode } from "./lib/rotaJoin";
import {
  addDays,
  isReadingDate,
  isValidReadingDays,
  messageTimesError,
  nextReadingDates,
  readingDaysValidator,
  rotaMessagesValidator,
  ROTA_SIZE,
  slotFor,
  type ReadingDays,
  type RotaMessages,
} from "./lib/rota";
import {
  earliestOpenDate,
  lastRotaDay,
  slotRowsByJuz,
  targetDay,
} from "./lib/rotaPlace";
import type { SessionContext } from "./lib/session";
import { sessionMutation, sessionQuery } from "./lib/session";
import { getSetting, quietHours } from "./lib/settings";
import {
  cleanDisplayName,
  cleanKhatmaName,
  maskPhone,
  normalizePhone,
} from "./lib/text";
import { khatmaTitle } from "./lib/whatsappTemplates";
import { instantAt, localDate, safeTimeZone } from "./lib/wakingTime";
import { celebrateIfComplete, completeIfDone } from "./rotaDays";
import { enqueue } from "./rotaOutbox";
import { env } from "./whatsapp";

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
    joinCode: v.string(),
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
    const joinTaken = await ctx.db
      .query("khatmas")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (joinTaken) return null;

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
      joinCode: args.joinCode,
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
        // No day starts until the organizer finishes adding people (`finishSetup`).
        setupDoneAt: null,
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
        joinCode: randomJoinCode(),
        shareToken: randomToken(8),
      });
      if (created) return created;
    }
    throw new Error("could not allocate an invite or join code");
  },
});

/**
 * The rota khatma's join code, drawing and storing one when it has none (a
 * khatma created before join codes). For mutations: `by_joinCode` is checked
 * inside the transaction, so a drawn code is never taken. A join code is not a
 * secret: it is shared in the group and only admits a phone the organizer
 * listed, or files a request they approve. Uniqueness comes from that
 * in-transaction check; real secrets must still be drawn in actions (see the
 * header of `lib/crypto.ts`).
 */
export async function ensureJoinCode(
  ctx: MutationCtx,
  khatma: Doc<"khatmas">,
): Promise<string> {
  if (khatma.joinCode !== undefined) return khatma.joinCode;
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS * 3; attempt++) {
    const joinCode = randomJoinCode();
    const taken = await ctx.db
      .query("khatmas")
      .withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode))
      .first();
    if (taken) continue;
    await ctx.db.patch(khatma._id, { joinCode });
    return joinCode;
  }
  throw new Error("could not allocate a join code");
}

// ---------------------------------------------------------------------------
// People

type RotaConfig = NonNullable<Doc<"khatmas">["rota"]>;

/**
 * The organizer, their rota khatma and its settings, for every change the
 * organizer makes: `forbidden` for anyone else (and for a pool khatma), and
 * `archived` once the khatma is archived, which leaves it read-only.
 */
async function requireRotaOrganizer(
  ctx: MutationCtx & SessionContext,
  inviteCode: string,
): Promise<{
  person: Doc<"people">;
  khatma: Doc<"khatmas">;
  rota: RotaConfig;
}> {
  const { person, khatma } = await requireOrganizer(ctx, inviteCode);
  const rota = khatma.rota;
  if (khatma.kind !== "rota" || !rota) {
    throw new ConvexError({ code: "forbidden" });
  }
  if (rota.archivedAt !== null) throw new ConvexError({ code: "archived" });
  return { person, khatma, rota };
}

/**
 * Ends setup: from now the khatma's days may start, and if today's start
 * time has passed already, today's day starts at once. Safe to repeat.
 */
export const finishSetup = sessionMutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { khatma, rota } = await requireRotaOrganizer(ctx, args.inviteCode);
    if (rota.setupDoneAt === null) {
      await ctx.db.patch(khatma._id, {
        rota: { ...rota, setupDoneAt: Date.now() },
      });
      await ctx.scheduler.runAfter(0, internal.rotaDays.tick, {
        khatmaId: khatma._id,
      });
    }
    return { ok: true };
  },
});

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

/** What the organizer sees of one participant; the phone is the one they typed. */
type PersonState = {
  phone: string;
  /** They sent their own join message. */
  joined: boolean;
  /** They sent «إيقاف». */
  stopped: boolean;
  /** Wirdak stopped messaging them after days without a reply. */
  silenced: boolean;
};

type PeopleView = {
  /** The khatma's title, as the join message names it. */
  title: string;
  /** The wa.me link members tap to join; null until the khatma has a join code. */
  joinLink: string | null;
  /** Numbers that sent the join code and wait for the organizer's answer. */
  requests: {
    id: Id<"rotaJoinRequests">;
    name: string | null;
    phoneMasked: string;
    createdAt: number;
  }[];
  target: { number: number; date: string | null; isFirst: boolean };
  rows: {
    juz: number;
    participant:
      | ({
          id: Id<"rotaParticipants">;
          name: string;
          isMe: boolean;
          slots: number;
        } & PersonState)
      | null;
  }[];
  participants: ({
    id: Id<"rotaParticipants">;
    name: string;
    isMe: boolean;
    juz: number[];
  } & PersonState)[];
  freeJuz: number[];
  maxSlots: number;
};

function personState(p: Doc<"rotaParticipants">): PersonState {
  return {
    phone: p.phone,
    joined: p.joinedAt != null,
    stopped: p.stoppedAt != null,
    silenced: p.silencedAt != null,
  };
}

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
    const requests = (
      await ctx.db
        .query("rotaJoinRequests")
        .withIndex("by_khatma_open", (q) =>
          q.eq("khatmaId", khatma._id).eq("resolvedAt", null),
        )
        .collect()
    ).sort((a, b) => a.createdAt - b.createdAt);
    return {
      title: khatmaTitle(khatma),
      joinLink: khatmaJoinLink(khatma, env("WHATSAPP_PUBLIC_NUMBER")),
      requests: requests.map((r) => ({
        id: r._id,
        name: r.profileName,
        phoneMasked: maskPhone(r.phone),
        createdAt: r.createdAt,
      })),
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
                ...personState(holder),
              }
            : null,
        };
      }),
      participants: participants.map((p) => ({
        id: p._id,
        name: p.name,
        isMe: isMe(p),
        juz: heldBy.get(p._id) ?? [],
        ...personState(p),
      })),
      freeJuz: Array.from({ length: ROTA_SIZE }, (_, i) => i + 1).filter(
        (juz) => !byJuz.has(juz),
      ),
      maxSlots: await getSetting(ctx, "rotaMaxSlotsPerPerson"),
    };
  },
});

/**
 * Adds a new participant to the khatma on the juz' (or the lowest free one
 * when `juz` is undefined) of the next day to start. `joinedAt` is set only
 * for someone who already sent their join message.
 */
async function placeNewParticipant(
  ctx: MutationCtx,
  khatma: Doc<"khatmas">,
  who: { name: string; phone: string; personId: Id<"people"> | null },
  juz: number | undefined,
  joinedAt?: number,
): Promise<
  | { participantId: Id<"rotaParticipants">; juz: number }
  | { error: "no_free_juz" | "juz_taken" }
> {
  const target = await targetDay(ctx, khatma);
  const byJuz = await slotRowsByJuz(ctx, khatma._id, target.number);
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
    ...who,
    addedAt: Date.now(),
    removedAt: null,
    ...(joinedAt !== undefined ? { joinedAt } : {}),
  });
  await ctx.db.insert("rotaSlots", {
    khatmaId: khatma._id,
    slot: slotFor(juz, target.number),
    participantId,
  });
  return { participantId, juz };
}

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

    const placed = await placeNewParticipant(
      ctx,
      khatma,
      { name, phone, personId: null },
      args.juz,
    );
    if ("error" in placed) return placed;
    return { ok: true, ...placed };
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
  args: {
    inviteCode: v.string(),
    participantId: v.id("rotaParticipants"),
    juz: v.number(),
  },
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
    // The screen may be a day behind: only free the slot the organizer saw.
    if (!row || row.participantId !== args.participantId) {
      return { error: "not_found" };
    }
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

// ---------------------------------------------------------------------------
// Joining

/**
 * Makes sure the khatma has a join code, so the People screen can show its
 * link. Queries can't write, so the screen asks for this when it has none.
 */
export const ensureJoinLink = sessionMutation({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    await ensureJoinCode(ctx, khatma);
    return { ok: true };
  },
});

/** An open join request of this khatma, or null. */
async function openRequest(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  requestId: Id<"rotaJoinRequests">,
): Promise<Doc<"rotaJoinRequests"> | null> {
  const request = await ctx.db.get(requestId);
  return request && request.khatmaId === khatmaId && request.resolvedAt === null
    ? request
    : null;
}

/**
 * Accepts a join request: the number becomes a participant on that juz' of the
 * next day to start, already joined (their join message was the opt-in). If the
 * number was added meanwhile, the request is closed and linked to that person.
 */
export const acceptJoinRequest = sessionMutation({
  args: {
    inviteCode: v.string(),
    requestId: v.id("rotaJoinRequests"),
    juz: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true; participantId: Id<"rotaParticipants"> }
    | { error: "not_found" | "juz_taken" | "already_added" }
  > => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const request = await openRequest(ctx, khatma._id, args.requestId);
    if (!request) return { error: "not_found" };
    const now = Date.now();
    const existing = (
      await ctx.db
        .query("rotaParticipants")
        .withIndex("by_khatma_phone", (q) =>
          q.eq("khatmaId", khatma._id).eq("phone", request.phone),
        )
        .collect()
    ).find((p) => p.removedAt === null);
    if (existing) {
      if (existing.joinedAt == null) {
        await ctx.db.patch(existing._id, { joinedAt: now });
      }
      await ctx.db.patch(request._id, { resolvedAt: now, outcome: "accepted" });
      return { error: "already_added" };
    }

    const person = await ctx.db
      .query("people")
      .withIndex("by_phone", (q) => q.eq("phone", request.phone))
      .first();
    const placed = await placeNewParticipant(
      ctx,
      khatma,
      {
        name:
          cleanDisplayName(request.profileName ?? "") ??
          maskPhone(request.phone),
        phone: request.phone,
        personId: person?._id ?? null,
      },
      args.juz,
      now,
    );
    if ("error" in placed) {
      // `juz` was given, so a juz' is always chosen.
      return { error: "juz_taken" };
    }
    await ctx.db.patch(request._id, { resolvedAt: now, outcome: "accepted" });
    return { ok: true, participantId: placed.participantId };
  },
});

export const declineJoinRequest = sessionMutation({
  args: { inviteCode: v.string(), requestId: v.id("rotaJoinRequests") },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const request = await openRequest(ctx, khatma._id, args.requestId);
    if (!request) return { error: "not_found" };
    await ctx.db.patch(request._id, {
      resolvedAt: Date.now(),
      outcome: "declined",
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Today

type TodayView = {
  day: {
    number: number;
    cycle: number;
    date: string;
    doneCount: number;
    completedAt: number | null;
  } | null;
  next: { number: number; date: string | null };
  paused: boolean;
  archived: boolean;
  /** False until the organizer finishes setup; no day starts before. */
  setupDone: boolean;
  tiles: {
    readId: Id<"rotaReads">;
    juz: number;
    state: "done" | "unread" | "reassigned";
    holderName: string | null;
    readerName: string | null;
    readerId: Id<"rotaParticipants"> | null;
    /** What the reader answered to an unread juz': «ليس بعد», or nothing yet; null once done. */
    answer: "notYet" | "none" | null;
  }[];
  participants: {
    id: Id<"rotaParticipants">;
    name: string;
    isMe: boolean;
    doneToday: boolean;
  }[];
};

/** The latest reading day: the one open now, or today's if it has closed already. */
async function currentDay(
  ctx: QueryCtx,
  khatma: Doc<"khatmas">,
  timeZone: string,
): Promise<Doc<"rotaDays"> | null> {
  const last = await lastRotaDay(ctx, khatma._id);
  if (!last) return null;
  const isToday = last.date === localDate(Date.now(), timeZone);
  return last.closedAt === null || isToday ? last : null;
}

/** The day's 30 reads, the next day and who has finished, for the organizer's Today screen. */
export const today = sessionQuery({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<TodayView | null> => {
    const found = await organizerOf(ctx, args.inviteCode, ctx.person);
    if (!found || found.khatma.kind !== "rota") return null;
    const { person, khatma } = found;
    const rota = khatma.rota;
    if (!rota) return null;
    const target = await targetDay(ctx, khatma);
    const day = await currentDay(ctx, khatma, rota.timeZone);
    const reads = day
      ? await ctx.db
          .query("rotaReads")
          .withIndex("by_day_juz", (q) => q.eq("dayId", day._id))
          .collect()
      : [];
    const everyone = await ctx.db
      .query("rotaParticipants")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
      .collect();
    const byId = new Map(everyone.map((p) => [p._id, p]));
    const nameOf = (id: Id<"rotaParticipants"> | null) =>
      (id && byId.get(id)?.name) || null;

    const tiles = reads.map((r) => ({
      readId: r._id,
      juz: r.juz,
      state:
        r.doneAt !== null
          ? ("done" as const)
          : r.readerId !== r.holderId
            ? ("reassigned" as const)
            : ("unread" as const),
      holderName: nameOf(r.holderId),
      readerName: nameOf(r.readerId),
      readerId: r.readerId,
      answer:
        r.doneAt !== null
          ? null
          : r.notYetAt != null
            ? ("notYet" as const)
            : ("none" as const),
    }));
    const participants = everyone
      .filter((p) => p.removedAt === null)
      .sort(
        (a, b) => a.addedAt - b.addedAt || a._creationTime - b._creationTime,
      )
      .map((p) => {
        const mine = reads.filter((r) => r.readerId === p._id);
        return {
          id: p._id,
          name: p.name,
          isMe: p.personId === person._id,
          doneToday: mine.length > 0 && mine.every((r) => r.doneAt !== null),
        };
      });
    return {
      day: day
        ? {
            number: day.number,
            cycle: day.cycle,
            date: day.date,
            doneCount: reads.filter((r) => r.doneAt !== null).length,
            completedAt: day.completedAt,
          }
        : null,
      next: { number: target.number, date: target.date },
      paused: rota.pausedAt !== null,
      archived: rota.archivedAt !== null,
      setupDone: rota.setupDoneAt !== null,
      tiles,
      participants,
    };
  },
});

/** A read of this khatma and its day, or null when it is not one of this khatma's. */
async function readOf(
  ctx: QueryCtx,
  khatma: Doc<"khatmas">,
  readId: Id<"rotaReads">,
): Promise<{ read: Doc<"rotaReads">; day: Doc<"rotaDays"> } | null> {
  const read = await ctx.db.get(readId);
  if (!read || read.khatmaId !== khatma._id) return null;
  const day = await ctx.db.get(read.dayId);
  return day ? { read, day } : null;
}

export const reassign = sessionMutation({
  args: {
    inviteCode: v.string(),
    readId: v.id("rotaReads"),
    participantId: v.id("rotaParticipants"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" | "closed" | "done" }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const found = await readOf(ctx, khatma, args.readId);
    const participant = await activeParticipant(
      ctx,
      khatma._id,
      args.participantId,
    );
    if (!found || !participant) return { error: "not_found" };
    if (found.day.closedAt !== null) return { error: "closed" };
    if (found.read.doneAt !== null) return { error: "done" };
    const previousId = found.read.readerId;
    await ctx.db.patch(found.read._id, {
      readerId: participant._id,
      reassignedAt: Date.now(),
    });
    const row = {
      khatmaId: khatma._id,
      dayId: found.day._id,
      juz: [found.read.juz],
      number: found.day.number,
    };
    await enqueue(ctx, {
      ...row,
      participantId: participant._id,
      kind: "assigned",
    });
    // Whoever had it until now (the holder, or a reader it was reassigned to) is covered.
    if (previousId !== null && previousId !== participant._id) {
      await enqueue(ctx, {
        ...row,
        participantId: previousId,
        kind: "covered",
      });
    }
    return { ok: true };
  },
});

export const markDone = sessionMutation({
  args: { inviteCode: v.string(), readId: v.id("rotaReads") },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; completed: boolean } | { error: "not_found" | "closed" }
  > => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const found = await readOf(ctx, khatma, args.readId);
    if (!found) return { error: "not_found" };
    if (found.day.closedAt !== null) return { error: "closed" };
    if (found.read.doneAt === null) {
      await ctx.db.patch(found.read._id, {
        doneAt: Date.now(),
        doneByOrganizer: true,
      });
    }
    const completed = await completeIfDone(ctx, found.day._id);
    if (completed) await celebrateIfComplete(ctx, found.day._id);
    return { ok: true, completed };
  },
});

export const markNotDone = sessionMutation({
  args: { inviteCode: v.string(), readId: v.id("rotaReads") },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" | "closed" }> => {
    const { khatma } = await requireRotaOrganizer(ctx, args.inviteCode);
    const found = await readOf(ctx, khatma, args.readId);
    if (!found) return { error: "not_found" };
    if (found.day.closedAt !== null) return { error: "closed" };
    await ctx.db.patch(found.read._id, {
      doneAt: null,
      doneByOrganizer: false,
    });
    if (found.day.completedAt !== null) {
      await ctx.db.patch(found.day._id, { completedAt: null });
    }
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Settings

/** How many reading dates the pause-date picker offers. */
const UPCOMING_DATES = 8;

type SettingsView = {
  name: string;
  days: ReadingDays;
  firstDate: string;
  firstDatePassed: boolean;
  endDate: string | null;
  timeZone: string;
  messages: RotaMessages;
  pausedAt: number | null;
  pauseDates: string[];
  /** The next reading dates that can still be paused or un-paused. */
  upcoming: string[];
  quiet: { startHour: number; endHour: number };
  /** An archived khatma can no longer be changed. */
  archived: boolean;
};

/** The first date has passed, or its day has started: it can't move any more. */
async function firstDatePassed(
  ctx: QueryCtx,
  khatma: Doc<"khatmas">,
  rota: NonNullable<Doc<"khatmas">["rota"]>,
  today: string,
): Promise<boolean> {
  return (
    rota.firstDate < today || (await lastRotaDay(ctx, khatma._id)) !== null
  );
}

/** The rota settings behind the organizer's settings sheet. Organizer only. */
export const settings = sessionQuery({
  args: { inviteCode: v.string() },
  handler: async (ctx, args): Promise<SettingsView | null> => {
    const found = await organizerOf(ctx, args.inviteCode, ctx.person);
    if (!found || found.khatma.kind !== "rota") return null;
    const { khatma } = found;
    const rota = khatma.rota;
    if (!rota) return null;
    const today = localDate(Date.now(), rota.timeZone);
    const from = earliestOpenDate(
      rota,
      await lastRotaDay(ctx, khatma._id),
      today,
    );
    const quiet = await quietHours(ctx);
    return {
      name: khatma.name ?? "",
      days: rota.days,
      firstDate: rota.firstDate,
      firstDatePassed: await firstDatePassed(ctx, khatma, rota, today),
      endDate: rota.endDate,
      timeZone: rota.timeZone,
      messages: rota.messages,
      pausedAt: rota.pausedAt,
      pauseDates: rota.pauseDates,
      upcoming: nextReadingDates(
        rota.days,
        rota.firstDate,
        from,
        UPCOMING_DATES,
        new Set(),
      ).filter((date) => rota.endDate === null || date <= rota.endDate),
      quiet: { startHour: quiet.startHour, endHour: quiet.endHour },
      archived: rota.archivedAt !== null,
    };
  },
});

export const update = sessionMutation({
  args: {
    inviteCode: v.string(),
    name: v.optional(v.union(v.string(), v.null())),
    days: v.optional(readingDaysValidator),
    firstDate: v.optional(v.string()),
    endDate: v.optional(v.union(v.string(), v.null())),
    timeZone: v.optional(v.string()),
    messages: v.optional(rotaMessagesValidator),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { ok: true }
    | {
        error:
          | "invalid_days"
          | "invalid_dates"
          | "first_date_passed"
          | "invalid_times"
          | "invalid_zone"
          | "invalid_name";
      }
  > => {
    const { khatma, rota } = await requireRotaOrganizer(ctx, args.inviteCode);

    // A rota khatma always has a name, as at creation.
    const name =
      args.name === undefined ? undefined : cleanKhatmaName(args.name);
    if (name === null) return { error: "invalid_name" };
    if (args.days !== undefined && !isValidReadingDays(args.days)) {
      return { error: "invalid_days" };
    }
    if (
      args.timeZone !== undefined &&
      safeTimeZone(args.timeZone) !== args.timeZone
    ) {
      return { error: "invalid_zone" };
    }

    const days = args.days ?? rota.days;
    const timeZone = args.timeZone ?? rota.timeZone;
    const firstDate = args.firstDate ?? rota.firstDate;
    const endDate = args.endDate === undefined ? rota.endDate : args.endDate;
    const today = localDate(Date.now(), timeZone);
    if (
      !isDate(firstDate) ||
      (endDate !== null && (!isDate(endDate) || endDate < firstDate))
    ) {
      return { error: "invalid_dates" };
    }
    // An end date behind today or the last started day would archive the
    // khatma for good, and so would one that no reading date reaches. Days and
    // the time zone move both, so they are checked together with the end date.
    if (
      endDate !== null &&
      (args.days !== undefined ||
        args.timeZone !== undefined ||
        args.endDate !== undefined)
    ) {
      const last = await lastRotaDay(ctx, khatma._id);
      if (endDate < today || (last && endDate < last.date)) {
        return { error: "invalid_dates" };
      }
      // From the first open date, a reading date must remain on or before the
      // end date. (None is left only when the end date is the last started day.)
      const from = earliestOpenDate({ ...rota, firstDate }, last, today);
      if (from <= endDate) {
        const [next] = nextReadingDates(days, firstDate, from, 1, new Set());
        if (next === undefined || next > endDate) {
          return { error: "invalid_dates" };
        }
      }
    }
    const passed = await firstDatePassed(ctx, khatma, rota, today);
    if (passed && firstDate !== rota.firstDate) {
      return { error: "first_date_passed" };
    }
    // A first date still ahead must be a reading date; one behind us is what it is.
    if (
      !passed &&
      (firstDate < today || !isReadingDate(days, firstDate, firstDate))
    ) {
      return { error: "invalid_dates" };
    }

    if (args.messages !== undefined) {
      const quiet = await quietHours(ctx);
      if (messageTimesError(args.messages, quiet.startHour, quiet.endHour)) {
        return { error: "invalid_times" };
      }
    }

    await ctx.db.patch(khatma._id, {
      ...(name !== undefined ? { name } : {}),
      rota: {
        ...rota,
        days,
        firstDate,
        endDate,
        timeZone,
        messages: args.messages ?? rota.messages,
      },
    });

    // The open day closes at the next day's start time, which may just have moved.
    if (args.messages !== undefined || args.timeZone !== undefined) {
      const last = await lastRotaDay(ctx, khatma._id);
      if (last && last.closedAt === null) {
        await ctx.db.patch(last._id, {
          closesAt: instantAt(
            addDays(last.date, 1),
            (args.messages ?? rota.messages).dayAt,
            timeZone,
          ),
        });
      }
    }
    return { ok: true };
  },
});

export const setPaused = sessionMutation({
  args: { inviteCode: v.string(), paused: v.boolean() },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { khatma, rota } = await requireRotaOrganizer(ctx, args.inviteCode);
    const pausedAt = args.paused ? (rota.pausedAt ?? Date.now()) : null;
    await ctx.db.patch(khatma._id, { rota: { ...rota, pausedAt } });
    return { ok: true };
  },
});

export const addPauseDate = sessionMutation({
  args: { inviteCode: v.string(), date: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_reading_date" | "past" }> => {
    const { khatma, rota } = await requireRotaOrganizer(ctx, args.inviteCode);
    if (
      !isDate(args.date) ||
      !isReadingDate(rota.days, rota.firstDate, args.date) ||
      (rota.endDate !== null && args.date > rota.endDate)
    ) {
      return { error: "not_reading_date" };
    }
    const started = await ctx.db
      .query("rotaDays")
      .withIndex("by_khatma_date", (q) =>
        q.eq("khatmaId", khatma._id).eq("date", args.date),
      )
      .first();
    if (started || args.date < localDate(Date.now(), rota.timeZone)) {
      return { error: "past" };
    }
    if (!rota.pauseDates.includes(args.date)) {
      await ctx.db.patch(khatma._id, {
        rota: { ...rota, pauseDates: [...rota.pauseDates, args.date].sort() },
      });
    }
    return { ok: true };
  },
});

export const removePauseDate = sessionMutation({
  args: { inviteCode: v.string(), date: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_reading_date" | "past" }> => {
    const { khatma, rota } = await requireRotaOrganizer(ctx, args.inviteCode);
    if (!isDate(args.date)) return { error: "not_reading_date" };
    if (args.date < localDate(Date.now(), rota.timeZone)) {
      return { error: "past" };
    }
    if (rota.pauseDates.includes(args.date)) {
      await ctx.db.patch(khatma._id, {
        rota: {
          ...rota,
          pauseDates: rota.pauseDates.filter((d) => d !== args.date),
        },
      });
    }
    return { ok: true };
  },
});
