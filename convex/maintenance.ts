import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getSetting } from "./lib/settings";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Max rows deleted per table per run, keeping each mutation well under Convex limits. */
const BATCH = 500;

/**
 * Retention: rate-limit rows (which may be IP-keyed) are purged as soon as their
 * window has expired (`expiresAt < now`), so an IP is held at most as long as its
 * window (spec 9: at most 24 hours). Phone numbers in verifications 24 hours;
 * WhatsApp dedupe ids 7 days.
 */
const INBOUND_TTL_MS = 7 * DAY_MS;
const VERIFICATION_TTL_MS = DAY_MS;
const HANDOFF_TTL_MS = DAY_MS;

/** Deletes up to BATCH rows; returns true when more old rows remain. */
async function deleteBatch(
  ctx: MutationCtx,
  rows: {
    _id: Id<
      | "rateLimits"
      | "inboundMessages"
      | "verifications"
      | "notes"
      | "handoffTokens"
    >;
  }[],
): Promise<boolean> {
  for (const row of rows.slice(0, BATCH)) await ctx.db.delete(row._id);
  return rows.length > BATCH;
}

export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const notesRetention = await getSetting(ctx, "notesRetentionMs");

    const rateLimits = await ctx.db
      .query("rateLimits")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(BATCH + 1);
    const inbound = await ctx.db
      .query("inboundMessages")
      .withIndex("by_receivedAt", (q) =>
        q.lt("receivedAt", now - INBOUND_TTL_MS),
      )
      .take(BATCH + 1);
    const verifications = await ctx.db
      .query("verifications")
      .withIndex("by_createdAt", (q) =>
        q.lt("createdAt", now - VERIFICATION_TTL_MS),
      )
      .take(BATCH + 1);

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - notesRetention))
      .take(BATCH + 1);
    const handoffs = await ctx.db
      .query("handoffTokens")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - HANDOFF_TTL_MS))
      .take(BATCH + 1);

    const more = [
      await deleteBatch(ctx, rateLimits),
      await deleteBatch(ctx, inbound),
      await deleteBatch(ctx, verifications),
      await deleteBatch(ctx, notes),
      await deleteBatch(ctx, handoffs),
    ].some(Boolean);

    if (more) await ctx.scheduler.runAfter(0, internal.maintenance.purge, {});
  },
});
