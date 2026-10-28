import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { randomToken, sha256Hex } from "./lib/crypto";
import { checkShardedRateLimit } from "./lib/rateLimit";
import { getSetting } from "./lib/settings";
import { insertSession } from "./sessions";
import { cleanTimeZone } from "./verification";

/** The device label every hand-off session carries. */
export const HOME_SCREEN_LABEL = "iPhone · الشاشة الرئيسية";

const MINUTE_MS = 60_000;

/**
 * Stores a hand-off token's hash for the session behind `sessionTokenHash`
 * and returns how long it lives. `null` when that session doesn't exist.
 */
export const store = internalMutation({
  args: { sessionTokenHash: v.string(), tokenHash: v.string() },
  handler: async (ctx, args): Promise<number | null> => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) =>
        q.eq("tokenHash", args.sessionTokenHash),
      )
      .first();
    if (!session) return null;
    const now = Date.now();
    const ttlMs = await getSetting(ctx, "handoffTtlMs");
    await ctx.db.insert("handoffTokens", {
      tokenHash: args.tokenHash,
      personId: session.personId,
      sessionId: session._id,
      createdAt: now,
      expiresAt: now + ttlMs,
      usedAt: null,
    });
    return ttlMs;
  },
});

/**
 * Just before the "add to home screen" steps: a single-use token that lets the
 * home-screen app (separate storage) sign in as this person without WhatsApp.
 * The raw token is returned once and only its hash is kept. `ttlMs` tells the
 * page when to make a new one (the TTL is a live setting).
 */
export const create = action({
  args: { sessionToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; ttlMs: number } | { error: "not_signed_in" }> => {
    const token = randomToken(32);
    const ttlMs = await ctx.runMutation(internal.handoff.store, {
      sessionTokenHash: await sha256Hex(args.sessionToken),
      tokenHash: await sha256Hex(token),
    });
    return ttlMs === null ? { error: "not_signed_in" } : { token, ttlMs };
  },
});

/**
 * Check, mark used, and open the new session in one transaction, so two
 * concurrent redeems of one token can't both win. Every failure is `false`.
 */
export const redeemInternal = internalMutation({
  args: {
    tokenHash: v.string(),
    newTokenHash: v.string(),
    alertTokenHash: v.string(),
    timeZone: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const row = await ctx.db
      .query("handoffTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    // Only a guess (a hash nobody holds) spends the global bucket, so a flood
    // of random tokens can't lock out a real one. Every failure is still the
    // same `false`.
    if (!row) {
      await checkShardedRateLimit(
        ctx,
        "handoffRedeem:global",
        await getSetting(ctx, "handoffRedeemGlobalPerMinute"),
        MINUTE_MS,
      );
      return false;
    }
    if (row.usedAt !== null || Date.now() >= row.expiresAt) return false;
    const creator = await ctx.db.get(row.sessionId);
    if (!creator || creator.personId !== row.personId) return false;
    const person = await ctx.db.get(row.personId);
    if (!person) return false;

    await ctx.db.patch(row._id, { usedAt: Date.now() });
    // The home-screen app is a new device on the same phone.
    if (person.timeZone !== args.timeZone) {
      await ctx.db.patch(person._id, { timeZone: args.timeZone });
    }
    await insertSession(ctx, {
      personId: person._id,
      tokenHash: args.newTokenHash,
      alertTokenHash: args.alertTokenHash,
      deviceLabel: HOME_SCREEN_LABEL,
    });
    return true;
  },
});

/**
 * First launch of the home-screen app: trade the token for a session of its
 * own. No WhatsApp alert (spec 5.4: the token only comes from a session already
 * signed in on this phone). The token and its hash are never logged.
 */
export const redeem = action({
  args: { token: v.string(), timeZone: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ sessionToken: string } | { error: "invalid" }> => {
    const sessionToken = randomToken(32);
    const alertToken = randomToken(32);
    const ok = await ctx.runMutation(internal.handoff.redeemInternal, {
      tokenHash: await sha256Hex(args.token),
      newTokenHash: await sha256Hex(sessionToken),
      alertTokenHash: await sha256Hex(alertToken),
      timeZone: cleanTimeZone(args.timeZone),
    });
    return ok ? { sessionToken } : { error: "invalid" };
  },
});
