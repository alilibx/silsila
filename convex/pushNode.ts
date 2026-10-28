"use node";

import { v } from "convex/values";
import { sendNotification } from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** How long a push service keeps an undelivered push (spec: 12 hours). */
const TTL_SECONDS = 12 * 3600;

type Subscription = { endpoint: string; p256dh: string; auth: string };

/**
 * Sends one payload to each subscription. Endpoints the push service reports
 * gone (404, 410) go to `onGone`. Nothing is sent without the VAPID keys.
 */
export async function sendToSubscriptions(
  subscriptions: Subscription[],
  payload: unknown,
  onGone: (endpoints: string[]) => Promise<unknown>,
): Promise<void> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.log("push skipped (no VAPID)");
    return;
  }
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((s) =>
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
      const sub = subscriptions[i];
      if (sub) gone.push(sub.endpoint);
    } else {
      console.error("push failed", status ?? "no status");
    }
  });
  if (gone.length > 0) await onGone(gone);
}

/**
 * Sends one note as a push to every subscription of its person. No logic of
 * its own: `push.deliveryPlan` decides whether and what to send.
 */
export const deliver = internalAction({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    if (
      !process.env.VAPID_PUBLIC_KEY ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.VAPID_SUBJECT
    ) {
      console.log("push skipped (no VAPID)");
      return;
    }
    const plan = await ctx.runQuery(internal.push.deliveryPlan, {
      noteId: args.noteId,
    });
    if (!plan) return;
    await ctx.runMutation(internal.push.markPushed, { noteId: args.noteId });
    await sendToSubscriptions(plan.subscriptions, plan.payload, (endpoints) =>
      ctx.runMutation(internal.push.removeGone, { endpoints }),
    );
  },
});

/** A team reply to a help request, as a push (plan 3 spec 3.4). */
export const deliverHelpReply = internalAction({
  args: { messageId: v.id("helpMessages") },
  handler: async (ctx, args) => {
    const plan = await ctx.runQuery(internal.push.helpReplyPlan, {
      messageId: args.messageId,
    });
    if (!plan) return;
    await sendToSubscriptions(plan.subscriptions, plan.payload, (endpoints) =>
      ctx.runMutation(internal.push.removeGone, { endpoints }),
    );
  },
});
