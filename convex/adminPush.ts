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
      notifySummary: ctx.admin.notifySummary !== false,
      notifyMilestones: ctx.admin.notifyMilestones !== false,
    };
  },
});

const notifyKindValidator = v.union(
  v.literal("help"),
  v.literal("summary"),
  v.literal("milestones"),
);
const FIELD = {
  help: "notifyHelp",
  summary: "notifySummary",
  milestones: "notifyMilestones",
} as const;

/** A personal preference, not a change to Wirdak, so not audited. */
export const setNotify = adminMutation({
  args: { kind: notifyKindValidator, on: v.boolean() },
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.patch(ctx.admin._id, { [FIELD[args.kind]]: args.on });
    return null;
  },
});

const pushKindValidator = v.union(
  v.literal("request"),
  v.literal("message"),
  v.literal("summary"),
  v.literal("milestone"),
);

/**
 * Who gets an admin push and what it says (spec 7). Help pushes never carry
 * the person's words or name: a lock screen is public. Summary and milestone
 * bodies are totals only, written by `stats.ts`.
 */
export const deliveryPlan = internalQuery({
  args: {
    kind: pushKindValidator,
    requestId: v.optional(v.id("helpRequests")),
    body: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const field =
      args.kind === "summary"
        ? FIELD.summary
        : args.kind === "milestone"
          ? FIELD.milestones
          : FIELD.help;
    const admins = await ctx.db.query("admins").collect();
    const listening = new Set<Id<"admins">>(
      admins.filter((a) => a[field] !== false).map((a) => a._id),
    );
    const rows = (
      await ctx.db.query("adminPushSubscriptions").collect()
    ).filter((r) => listening.has(r.adminId));
    if (rows.length === 0) return null;
    const help = args.kind === "request" || args.kind === "message";
    return {
      subscriptions: rows.map((r) => ({
        endpoint: r.endpoint,
        p256dh: r.p256dh,
        auth: r.auth,
      })),
      payload: help
        ? {
            title: "وِردك · الإدارة",
            body:
              args.kind === "request"
                ? "طلب مساعدة جديد"
                : "رسالة جديدة في طلب مساعدة",
            url: `/help/${args.requestId}`,
            tag: `help-${args.requestId}`,
          }
        : {
            title: "وِردك · الإدارة",
            body: args.body ?? "",
            url: "/",
            tag: args.tag ?? args.kind,
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
