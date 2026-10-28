import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Every kind of change the audit log records (spec 4.5). */
export const auditActionValidator = v.union(
  v.literal("admin.bootstrap"),
  v.literal("admin.add"),
  v.literal("admin.remove"),
  v.literal("setting.set"),
  v.literal("setting.reset"),
);

export type AuditAction = Infer<typeof auditActionValidator>;

/**
 * Records one admin change. Call it in the same mutation as the change, so the
 * change and its record commit together.
 */
export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    adminId: Id<"admins"> | null;
    action: AuditAction;
    targetKind: "admin" | "setting";
    targetId: string;
    before: unknown;
    after: unknown;
    note?: string;
  },
): Promise<void> {
  await ctx.db.insert("auditLog", {
    adminId: entry.adminId,
    action: entry.action,
    targetKind: entry.targetKind,
    targetId: entry.targetId,
    before: entry.before,
    after: entry.after,
    note: entry.note ?? null,
    at: Date.now(),
  });
}
