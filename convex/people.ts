import { ConvexError, v } from "convex/values";
import { paceDays, personPace, weekStreak } from "./lib/pace";
import { checkRateLimit } from "./lib/rateLimit";
import { requirePerson, sessionMutation, sessionQuery } from "./lib/session";
import { getSetting } from "./lib/settings";
import { cleanDisplayName } from "./lib/text";

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
