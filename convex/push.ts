import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { noteText } from "./lib/noteText";
import { requirePerson, sessionMutation, sessionQuery } from "./lib/session";
import { activeMembership } from "./khatmas";

/** At most this many devices per person; the oldest is dropped. */
const MAX_SUBSCRIPTIONS = 10;
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

/** The VAPID public key the browser subscribes with; null when push isn't set up. */
export const publicKey = query({
  args: {},
  handler: async (): Promise<string | null> =>
    process.env.VAPID_PUBLIC_KEY || null,
});

/**
 * Stores this device's subscription. The endpoint is unique: one that belonged
 * to someone else (a shared device, a new sign-in) moves to the caller.
 */
export const subscribe = sessionMutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const person = requirePerson(ctx);
    // The server posts to this URL, so only https push-service URLs are kept.
    if (
      !ctx.session ||
      !args.endpoint.startsWith("https://") ||
      args.endpoint.length > MAX_ENDPOINT_LENGTH ||
      args.p256dh.length === 0 ||
      args.p256dh.length > MAX_KEY_LENGTH ||
      args.auth.length === 0 ||
      args.auth.length > MAX_KEY_LENGTH
    ) {
      return { ok: false };
    }
    const now = Date.now();
    const fields = {
      personId: person._id,
      sessionId: ctx.session._id,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: now,
    };
    const [existing, ...duplicates] = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const d of duplicates) await ctx.db.delete(d._id);
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("pushSubscriptions", {
        ...fields,
        endpoint: args.endpoint,
      });
    }

    const mine = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_person", (q) => q.eq("personId", person._id))
      .collect();
    mine.sort(
      (a, b) => a.createdAt - b.createdAt || a._creationTime - b._creationTime,
    );
    for (const old of mine.slice(
      0,
      Math.max(0, mine.length - MAX_SUBSCRIPTIONS),
    )) {
      await ctx.db.delete(old._id);
    }
    return { ok: true };
  },
});

export const unsubscribe = sessionMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const person = requirePerson(ctx);
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of rows) {
      if (row.personId === person._id) await ctx.db.delete(row._id);
    }
    return { ok: true };
  },
});

/** Whether this device's subscription is stored for the caller. */
export const mine = sessionQuery({
  args: { endpoint: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ thisDevice: boolean }> => {
    const endpoint = args.endpoint;
    if (!ctx.person || !endpoint) return { thisDevice: false };
    const personId = ctx.person._id;
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
      .collect();
    return { thisDevice: rows.some((r) => r.personId === personId) };
  },
});

/** What `pushNode.deliver` sends; null when the note no longer calls for a push. */
export const deliveryPlan = internalQuery({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note || note.clearedAt !== null) return null;
    const member = await activeMembership(ctx, note.khatmaId, note.personId);
    if (!member || !member.notificationsOn) return null;
    const khatma = await ctx.db.get(note.khatmaId);
    if (!khatma) return null;
    const rows = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_person", (q) => q.eq("personId", note.personId))
      .collect();
    if (rows.length === 0) return null;
    return {
      subscriptions: rows.map((r) => ({
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
      })),
      payload: {
        title: "وِردك" as const,
        body: noteText(note),
        url: `/j/${khatma.inviteCode}`,
      },
    };
  },
});

/** Drops subscriptions the push service reported gone (404 or 410). */
export const removeGone = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const endpoint of args.endpoints) {
      const rows = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});

export const markPushed = internalMutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.noteId, { pushedAt: Date.now() });
  },
});
