import { ConvexError, v } from "convex/values";
import { paceDays, personPace, weekStreak } from "./lib/pace";
import { checkRateLimit } from "./lib/rateLimit";
import {
  LAST_USED_REFRESH_MS,
  requirePerson,
  sessionMutation,
  sessionQuery,
} from "./lib/session";
import { getSetting } from "./lib/settings";
import { cleanDisplayName } from "./lib/text";
import { cleanTimeZone } from "./verification";

const HOUR_MS = 3_600_000;

export const updateDisplayName = sessionMutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const person = requirePerson(ctx);
    if (await getSetting(ctx, "maintenanceMode")) {
      throw new ConvexError({ code: "maintenance" });
    }
    const displayName = cleanDisplayName(args.displayName);
    if (displayName === null) throw new ConvexError({ code: "invalid_name" });
    // after validation, so a refused name does not spend a change
    const allowed = await checkRateLimit(
      ctx,
      `name:${person._id}`,
      await getSetting(ctx, "nameChangesPerPersonPerHour"),
      HOUR_MS,
    );
    if (!allowed) throw new ConvexError({ code: "rate_limited" });
    await ctx.db.patch(person._id, { displayName });
  },
});

/**
 * The app calls this when it opens or comes back to the foreground. Records
 * that the caller was just here (at most once an hour, the same as the
 * session's `lastUsedAt`) and keeps their time zone current, which waking time
 * and quiet hours read. Signed-out callers get `{ ok: false }`.
 */
export const touch = sessionMutation({
  args: { timeZone: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const person = ctx.person;
    if (!person) return { ok: false };
    const now = Date.now();
    const timeZone = cleanTimeZone(args.timeZone);
    await ctx.db.patch(person._id, {
      ...(now - person.lastSeenAt >= LAST_USED_REFRESH_MS
        ? { lastSeenAt: now }
        : {}),
      ...(timeZone !== person.timeZone ? { timeZone } : {}),
    });
    return { ok: true };
  },
});

export type MyStats = {
  paceDays: number | null;
  juzRead: number;
  weekStreak: number | null;
};

/**
 * The caller's own numbers (spec 4.1, 4.4): their pace once three finishes
 * count, every juz' they finished, and the weekly streak while it is two or
 * more. `null` when signed out. Never shown to anyone else.
 */
export const myStats = sessionQuery({
  args: {},
  handler: async (ctx): Promise<MyStats | null> => {
    const person = ctx.person;
    if (!person) return null;
    const personId = person._id;
    const finishedAts: number[] = [];
    const rows = ctx.db
      .query("assignments")
      .withIndex("by_person_finishedAt", (q) => q.eq("personId", personId));
    for await (const a of rows) {
      if (a.finishedAt !== null) finishedAts.push(a.finishedAt);
    }
    const pace = await personPace(ctx, personId);
    const streak = weekStreak(finishedAts, person.timeZone, Date.now());
    return {
      paceDays: pace.known ? paceDays(pace.paceMs) : null,
      juzRead: finishedAts.length,
      weekStreak: streak >= 2 ? streak : null,
    };
  },
});
