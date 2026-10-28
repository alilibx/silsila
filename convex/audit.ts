import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { adminQuery } from "./lib/adminSession";
import { auditActionValidator } from "./lib/audit";

/** The audit log, newest first (spec 4.5). Filter by one admin or one action. */
export const list = adminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    adminId: v.optional(v.id("admins")),
    action: v.optional(auditActionValidator),
  },
  handler: async (ctx, args) => {
    const { adminId, action } = args;
    if (adminId !== undefined && action !== undefined) {
      throw new ConvexError({ code: "one_filter" });
    }
    const rows =
      adminId !== undefined
        ? ctx.db
            .query("auditLog")
            .withIndex("by_admin_at", (q) => q.eq("adminId", adminId))
        : action !== undefined
          ? ctx.db
              .query("auditLog")
              .withIndex("by_action_at", (q) => q.eq("action", action))
          : ctx.db.query("auditLog").withIndex("by_at");
    const result = await rows.order("desc").paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map((row) => ({
        _id: row._id,
        at: row.at,
        action: row.action,
        targetKind: row.targetKind,
        targetId: row.targetId,
        before: row.before as unknown,
        after: row.after as unknown,
        note: row.note,
        adminPhone: row.adminPhone,
      })),
    };
  },
});
