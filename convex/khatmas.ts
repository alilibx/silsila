import { ConvexError, v, type VLiteral } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { randomToken } from "./lib/crypto";
import { JUZ } from "./lib/juz";
import { checkRateLimit } from "./lib/rateLimit";
import { SCHEDULES, type Schedule } from "./lib/schedule";
import { getSetting } from "./lib/settings";
import { resolveSession, sessionQuery } from "./lib/session";
import { cleanKhatmaName } from "./lib/text";
import { insertRound, heldAssignment, roundAssignments } from "./rounds";

const JUZ_COUNT = 30;
const DAY_MS = 86_400_000;
/** `randomToken(9)` is 12 base64url characters; `randomToken(8)` is 11. */
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{12}$/;
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{11}$/;
/** Attempts at drawing an unused invite code; a collision is ~1e-20 likely. */
const INVITE_CODE_ATTEMPTS = 3;

type ScheduleLiterals = [
  VLiteral<Schedule>,
  VLiteral<Schedule>,
  ...VLiteral<Schedule>[],
];
/** Same union as the schema's `khatmas.schedule`, built from the same source list. */
const scheduleArg = v.union(
  ...(SCHEDULES.map((s) => v.literal(s)) as ScheduleLiterals),
);

export type TileView = {
  juz: number;
  name: string;
  state: "open" | "reading" | "done";
  readerName: string | null;
  isMine: boolean;
};

export type KhatmaView = {
  khatmaId: Id<"khatmas">;
  name: string | null;
  createdAt: number;
  schedule: Schedule;
  roundNumber: number;
  targetEndAt: number | null;
  completedRounds: number;
  memberCount: number;
  lastCompleted: { roundNumber: number; participants: number } | null;
  inviterName: string | null;
  tiles: TileView[];
  me: {
    signedIn: boolean;
    isMember: boolean;
    holding: number | null;
    suggestion: number | null;
    celebrateRound: number | null;
  };
};

// ---------------------------------------------------------------------------
// Shared helpers

/** The khatma behind an invite code, or `null` (malformed codes never reach the index). */
export async function khatmaByInviteCode(
  ctx: QueryCtx,
  inviteCode: string,
): Promise<Doc<"khatmas"> | null> {
  if (!INVITE_CODE_RE.test(inviteCode)) return null;
  return await ctx.db
    .query("khatmas")
    .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
    .first();
}

/** The person's ACTIVE membership of a khatma; blocked members count as non-members. */
export async function activeMembership(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  personId: Id<"people">,
): Promise<Doc<"members"> | null> {
  const member = await ctx.db
    .query("members")
    .withIndex("by_khatma_person", (q) =>
      q.eq("khatmaId", khatmaId).eq("personId", personId),
    )
    .first();
  return member?.status === "active" ? member : null;
}

/** Per-juz state from a round's assignment rows: done beats reading beats open. */
function juzStates(
  assignments: readonly Doc<"assignments">[],
): Map<number, { state: "reading" | "done"; assignment: Doc<"assignments"> }> {
  const byJuz = new Map<
    number,
    { state: "reading" | "done"; assignment: Doc<"assignments"> }
  >();
  for (const a of assignments) {
    if (byJuz.get(a.juz)?.state === "done") continue;
    if (a.finishedAt !== null)
      byJuz.set(a.juz, { state: "done", assignment: a });
    else if (a.releasedAt === null)
      byJuz.set(a.juz, { state: "reading", assignment: a });
  }
  return byJuz;
}

/**
 * The 30 tiles of a round. Reader names go only to members, only on "reading"
 * tiles (looked up in `readerNames`); `isMine` marks the viewer's own reading
 * assignment. Pure: callers load the assignments and names.
 */
export function buildTiles(
  assignments: readonly Doc<"assignments">[],
  viewerIsMember: boolean,
  viewerPersonId: Id<"people"> | null,
  readerNames: ReadonlyMap<Id<"people">, string>,
  juzNames: readonly string[],
): TileView[] {
  const states = juzStates(assignments);
  return Array.from({ length: JUZ_COUNT }, (_, i) => {
    const juz = i + 1;
    const found = states.get(juz);
    const reading = found?.state === "reading" ? found.assignment : null;
    return {
      juz,
      name: juzNames[i] ?? "",
      state: found?.state ?? "open",
      readerName:
        viewerIsMember && reading
          ? (readerNames.get(reading.personId) ?? null)
          : null,
      isMine:
        viewerIsMember &&
        reading !== null &&
        viewerPersonId !== null &&
        reading.personId === viewerPersonId,
    };
  });
}

async function readerNamesFor(
  ctx: QueryCtx,
  assignments: readonly Doc<"assignments">[],
): Promise<Map<Id<"people">, string>> {
  const ids = new Set<Id<"people">>();
  for (const { state, assignment } of juzStates(assignments).values()) {
    if (state === "reading") ids.add(assignment.personId);
  }
  const names = new Map<Id<"people">, string>();
  for (const id of ids) {
    const person = await ctx.db.get(id);
    if (person) names.set(id, person.displayName);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Create

/** Resolves a raw session token to a person id. The client never supplies a person id. */
export const personIdForToken = internalQuery({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"people"> | null> =>
    (await resolveSession(ctx, args.sessionToken)).person?._id ?? null,
});

/** Inserts khatma, round 1, and the creator's membership atomically. `null` on invite-code collision. */
export const insertKhatma = internalMutation({
  args: {
    personId: v.id("people"),
    name: v.union(v.string(), v.null()),
    schedule: scheduleArg,
    inviteCode: v.string(),
    shareToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ inviteCode: string } | null> => {
    if (await getSetting(ctx, "maintenanceMode")) {
      throw new ConvexError({ code: "maintenance" });
    }
    const person = await ctx.db.get(args.personId);
    if (!person) throw new ConvexError({ code: "not_signed_in" });

    const taken = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.inviteCode))
      .first();
    if (taken) return null;

    const allowed = await checkRateLimit(
      ctx,
      `khatmaCreate:${args.personId}`,
      await getSetting(ctx, "createsPerPersonPerDay"),
      DAY_MS,
    );
    if (!allowed) throw new ConvexError({ code: "rate_limited" });

    const now = Date.now();
    const khatmaId = await ctx.db.insert("khatmas", {
      name: args.name,
      schedule: args.schedule,
      creatorPersonId: args.personId,
      inviteCode: args.inviteCode,
      completedRounds: 0,
      createdAt: now,
    });
    await insertRound(ctx, khatmaId, 1, now);
    await ctx.db.insert("members", {
      khatmaId,
      personId: args.personId,
      joinedAt: now,
      shareToken: args.shareToken,
      status: "active",
      nudgesOn: true,
      lastCelebratedRound: 0,
    });
    return { inviteCode: args.inviteCode };
  },
});

async function requirePersonId(
  ctx: ActionCtx,
  sessionToken: string | undefined,
): Promise<Id<"people">> {
  const personId = await ctx.runQuery(internal.khatmas.personIdForToken, {
    sessionToken,
  });
  if (!personId) throw new ConvexError({ code: "not_signed_in" });
  return personId;
}

export const create = action({
  args: {
    sessionToken: v.optional(v.string()),
    name: v.union(v.string(), v.null()),
    schedule: scheduleArg,
  },
  handler: async (ctx, args): Promise<{ inviteCode: string }> => {
    const personId = await requirePersonId(ctx, args.sessionToken);
    const name = cleanKhatmaName(args.name);
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      const created = await ctx.runMutation(internal.khatmas.insertKhatma, {
        personId,
        name,
        schedule: args.schedule,
        inviteCode: randomToken(9),
        shareToken: randomToken(8),
      });
      if (created) return created;
    }
    throw new Error("could not allocate an invite code");
  },
});

// ---------------------------------------------------------------------------
// View

export const view = sessionQuery({
  args: { inviteCode: v.string(), from: v.optional(v.string()) },
  handler: async (ctx, args): Promise<KhatmaView | { notFound: true }> => {
    const khatma = await khatmaByInviteCode(ctx, args.inviteCode);
    if (!khatma || !khatma.currentRoundId) return { notFound: true };
    const round = await ctx.db.get(khatma.currentRoundId);
    if (!round) return { notFound: true };

    const members = await ctx.db
      .query("members")
      .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
      .collect();
    const active = members.filter((m) => m.status === "active");
    const personId = ctx.person?._id ?? null;
    const me = personId
      ? (active.find((m) => m.personId === personId) ?? null)
      : null;
    const isMember = me !== null;

    const assignments = await roundAssignments(ctx, round._id);
    const readerNames = isMember
      ? await readerNamesFor(ctx, assignments)
      : new Map<Id<"people">, string>();
    const tiles = buildTiles(
      assignments,
      isMember,
      personId,
      readerNames,
      JUZ.map((j) => j.name),
    );

    const held = me && personId ? heldAssignment(assignments, personId) : null;
    const holding = held?.juz ?? null;
    // Until suggestJuz (Task 7) lands: the lowest open juz' for anyone not already holding one.
    const suggestion =
      holding === null
        ? (tiles.find((tile) => tile.state === "open")?.juz ?? null)
        : null;

    let inviterName: string | null = null;
    if (args.from && SHARE_TOKEN_RE.test(args.from)) {
      const inviter = active.find((m) => m.shareToken === args.from);
      if (inviter) {
        inviterName = (await ctx.db.get(inviter.personId))?.displayName ?? null;
      }
    }

    return {
      khatmaId: khatma._id,
      name: khatma.name,
      createdAt: khatma.createdAt,
      schedule: khatma.schedule,
      roundNumber: round.number,
      targetEndAt: round.targetEndAt,
      completedRounds: khatma.completedRounds,
      memberCount: active.length,
      lastCompleted: await lastCompletedRound(ctx, khatma._id),
      inviterName,
      tiles,
      me: {
        signedIn: ctx.person !== null,
        isMember,
        holding,
        suggestion,
        celebrateRound:
          me && me.lastCelebratedRound < khatma.completedRounds
            ? khatma.completedRounds
            : null,
      },
    };
  },
});

async function lastCompletedRound(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
): Promise<{ roundNumber: number; participants: number } | null> {
  const round = await ctx.db
    .query("rounds")
    .withIndex("by_khatma_number", (q) => q.eq("khatmaId", khatmaId))
    .order("desc")
    .filter((q) => q.neq(q.field("completedAt"), null))
    .first();
  if (!round) return null;
  const finished = new Set<Id<"people">>();
  for (const a of await roundAssignments(ctx, round._id)) {
    if (a.finishedAt !== null) finished.add(a.personId);
  }
  return { roundNumber: round.number, participants: finished.size };
}

// ---------------------------------------------------------------------------
// Mine

export const mine = sessionQuery({
  args: {},
  handler: async (ctx) => {
    if (!ctx.person) return [];
    const personId = ctx.person._id;
    const memberships = await ctx.db
      .query("members")
      .withIndex("by_person", (q) => q.eq("personId", personId))
      .collect();
    const active = memberships
      .filter((m) => m.status === "active")
      .sort(
        (a, b) => b.joinedAt - a.joinedAt || b._creationTime - a._creationTime,
      );
    const out: {
      inviteCode: string;
      name: string | null;
      createdAt: number;
      schedule: Schedule;
      done: number;
      holding: number | null;
    }[] = [];
    for (const m of active) {
      const khatma = await ctx.db.get(m.khatmaId);
      if (!khatma) continue;
      const assignments = khatma.currentRoundId
        ? await roundAssignments(ctx, khatma.currentRoundId)
        : [];
      const done = [...juzStates(assignments).values()].filter(
        (s) => s.state === "done",
      ).length;
      out.push({
        inviteCode: khatma.inviteCode,
        name: khatma.name,
        createdAt: khatma.createdAt,
        schedule: khatma.schedule,
        done,
        holding: heldAssignment(assignments, personId)?.juz ?? null,
      });
    }
    return out;
  },
});

// ---------------------------------------------------------------------------
// Share token

/** Returns the member's share token, storing `candidate` first if they have none. */
export const storeShareToken = internalMutation({
  args: {
    personId: v.id("people"),
    inviteCode: v.string(),
    candidate: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    const khatma = await khatmaByInviteCode(ctx, args.inviteCode);
    if (!khatma) throw new ConvexError({ code: "not_found" });
    const member = await activeMembership(ctx, khatma._id, args.personId);
    if (!member) throw new ConvexError({ code: "not_member" });
    if (member.shareToken) return member.shareToken;
    await ctx.db.patch(member._id, { shareToken: args.candidate });
    return args.candidate;
  },
});

export const ensureShareToken = action({
  args: { sessionToken: v.optional(v.string()), inviteCode: v.string() },
  handler: async (ctx, args): Promise<{ shareToken: string }> => {
    const personId = await requirePersonId(ctx, args.sessionToken);
    const shareToken = await ctx.runMutation(internal.khatmas.storeShareToken, {
      personId,
      inviteCode: args.inviteCode,
      candidate: randomToken(8),
    });
    return { shareToken };
  },
});
