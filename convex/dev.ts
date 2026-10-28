import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { endGraceIfDue, isHeld } from "./grace";
import { randomToken } from "./lib/crypto";
import { isDev } from "./whatsapp";

/**
 * Dev-only stand-in for a WhatsApp message arriving at the webhook:
 * `bun run convex run dev:simulateIncoming '{"from":"971501234567","text":"…"}'`.
 */
export const simulateIncoming = internalAction({
  args: { from: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<void> => {
    if (!isDev()) {
      throw new Error("simulateIncoming runs only when WIRDAK_ENV is dev");
    }
    await ctx.runAction(internal.whatsapp.handleIncoming, {
      waMessageId: `dev.${randomToken(12)}`,
      from: args.from,
      text: args.text,
    });
  },
});

/**
 * Dev-only: ends the grace of the current hold of a juz' right now, the way the
 * scheduled `grace.endDue` would at its end (same checks, same effects), so a
 * test needn't wait hours:
 * `bun run convex run dev:forceGraceEnd '{"inviteCode":"…","juz":5}'`.
 */
export const forceGraceEnd = internalMutation({
  args: { inviteCode: v.string(), juz: v.number() },
  handler: async (ctx, args): Promise<void> => {
    if (!isDev()) {
      throw new Error("forceGraceEnd runs only when WIRDAK_ENV is dev");
    }
    const khatma = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.inviteCode))
      .unique();
    if (!khatma?.currentRoundId) throw new Error("no such khatma");
    const roundId = khatma.currentRoundId;
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_round_juz", (q) =>
        q.eq("roundId", roundId).eq("juz", args.juz),
      )
      .collect();
    const hold = rows.find(isHeld);
    if (!hold) throw new Error(`juz ${args.juz} has no current hold`);
    await endGraceIfDue(ctx, hold, hold.graceEndsAt);
  },
});
