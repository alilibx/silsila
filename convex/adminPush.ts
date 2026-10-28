import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/adminSession";

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

/** Stores this device's push subscription for the admin. An endpoint has one owner. */
export const subscribe = adminMutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args): Promise<null> => {
    if (
      !args.endpoint.startsWith("https://") ||
      args.endpoint.length > MAX_ENDPOINT_LENGTH ||
      args.p256dh.length > MAX_KEY_LENGTH ||
      args.auth.length > MAX_KEY_LENGTH
    ) {
      return null;
    }
    const existing = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("adminPushSubscriptions", {
      adminId: ctx.admin._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const unsubscribe = adminMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const rows = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const row of rows) {
      if (row.adminId === ctx.admin._id) await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** Whether this device gets the caller's pushes, and the caller's help alert switch. */
export const mine = adminQuery({
  args: { endpoint: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const endpoint = args.endpoint;
    const rows =
      endpoint === undefined
        ? []
        : await ctx.db
            .query("adminPushSubscriptions")
            .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
            .collect();
    return {
      thisDevice: rows.some((r) => r.adminId === ctx.admin._id),
      notifyHelp: ctx.admin.notifyHelp !== false,
    };
  },
});

/** A personal preference, not a change to Wirdak, so not audited. */
export const setNotifyHelp = adminMutation({
  args: { on: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(ctx.admin._id, { notifyHelp: args.on });
    return null;
  },
});

/**
 * Who gets a help push and what it says (spec 7). The text never carries the
 * person's words or name: a lock screen is public.
 */
export const deliveryPlan = internalQuery({
  args: {
    requestId: v.id("helpRequests"),
    kind: v.union(v.literal("request"), v.literal("message")),
  },
  handler: async (ctx, args) => {
    const admins = await ctx.db.query("admins").collect();
    const listening = new Set<Id<"admins">>(
      admins.filter((a) => a.notifyHelp !== false).map((a) => a._id),
    );
    const rows = (
      await ctx.db.query("adminPushSubscriptions").collect()
    ).filter((r) => listening.has(r.adminId));
    if (rows.length === 0) return null;
    return {
      subscriptions: rows.map((r) => ({
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
      })),
      payload: {
        title: "وِردك · الإدارة",
        body:
          args.kind === "request"
            ? "طلب مساعدة جديد"
            : "رسالة جديدة في طلب مساعدة",
        url: `/help/${args.requestId}`,
        tag: `help-${args.requestId}`,
      },
    };
  },
});

/** Drops admin subscriptions the push service reported gone. */
export const removeGone = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const endpoint of args.endpoints) {
      const rows = await ctx.db
        .query("adminPushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});
