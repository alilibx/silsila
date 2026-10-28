import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { randomToken } from "./lib/crypto";
import { isDev } from "./whatsapp";

/**
 * Dev-only stand-in for a WhatsApp message arriving at the webhook:
 * `npx convex run dev:simulateIncoming '{"from":"971501234567","text":"…"}'`.
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
