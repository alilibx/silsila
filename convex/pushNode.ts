"use node";

import { v } from "convex/values";
import { sendNotification } from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** How long a push service keeps an undelivered push (spec: 12 hours). */
const TTL_SECONDS = 12 * 3600;

/**
 * Sends one note as a push to every subscription of its person. No logic of
 * its own: `push.deliveryPlan` decides whether and what to send.
 */
export const deliver = internalAction({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      console.log("push skipped (no VAPID)");
      return;
    }

    const plan = await ctx.runQuery(internal.push.deliveryPlan, {
      noteId: args.noteId,
    });
    if (!plan) return;
    await ctx.runMutation(internal.push.markPushed, { noteId: args.noteId });

    const body = JSON.stringify(plan.payload);
    const results = await Promise.allSettled(
      plan.subscriptions.map((s) =>
        sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          {
            TTL: TTL_SECONDS,
            vapidDetails: { subject, publicKey, privateKey },
          },
        ),
      ),
    );

    const gone: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") return;
      const status = (r.reason as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        const sub = plan.subscriptions[i];
        if (sub) gone.push(sub.endpoint);
      } else {
        console.error("push failed", status ?? "no status");
      }
    });
    if (gone.length > 0) {
      await ctx.runMutation(internal.push.removeGone, { endpoints: gone });
    }
  },
});
