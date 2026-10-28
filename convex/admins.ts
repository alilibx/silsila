import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import {
  adminMutation,
  adminQuery,
  deleteAdminSessions,
} from "./lib/adminSession";
import { writeAudit } from "./lib/audit";
import { normalizeDigits } from "./lib/digits";
import { WA_PHONE } from "./whatsapp";

const MAX_PHONE_INPUT = 40;
const MAX_NOTE = 500;

/**
 * An admin's phone as E.164 (`+<digits>`), or null. Accepts spaces, dashes,
 * Arabic digits and a `00` prefix, but needs the country code: the allowlist
 * is matched against the number WhatsApp reports, which always has one.
 */
export function normalizeAdminPhone(raw: string): string | null {
  const compact = normalizeDigits(raw.slice(0, MAX_PHONE_INPUT)).replace(
    /[\s\-().]/gu,
    "",
  );
  const digits = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : null;
  return digits !== null && WA_PHONE.test(digits) ? `+${digits}` : null;
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim().slice(0, MAX_NOTE);
  return trimmed ? trimmed : undefined;
}

/**
 * Adds the first admin. Run from the command line only, while the allowlist is
 * empty: `bun run convex run admins:bootstrap '{"phone": "+971…"}'`.
 */
export const bootstrap = internalMutation({
  args: { phone: v.string() },
  handler: async (ctx, args): Promise<{ adminId: Id<"admins"> }> => {
    if ((await ctx.db.query("admins").first()) !== null) {
      throw new ConvexError({ code: "already_bootstrapped" });
    }
    const phone = normalizeAdminPhone(args.phone);
    if (phone === null) throw new ConvexError({ code: "invalid_phone" });
    const adminId = await ctx.db.insert("admins", {
      phone,
      addedBy: null,
      addedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor: null,
      action: "admin.bootstrap",
      targetKind: "admin",
      targetId: adminId,
      before: null,
      after: { phone },
    });
    return { adminId };
  },
});

export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db.query("admins").collect();
    return admins
      .sort((a, b) => a.addedAt - b.addedAt)
      .map((a) => ({
        adminId: a._id,
        phone: a.phone,
        addedAt: a.addedAt,
        isMe: a._id === ctx.admin._id,
      }));
  },
});

export const add = adminMutation({
  args: { phone: v.string(), note: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    { adminId: Id<"admins"> } | { error: "invalid_phone" | "already_admin" }
  > => {
    const phone = normalizeAdminPhone(args.phone);
    if (phone === null) return { error: "invalid_phone" };
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first();
    if (existing) return { error: "already_admin" };
    const adminId = await ctx.db.insert("admins", {
      phone,
      addedBy: ctx.admin._id,
      addedAt: Date.now(),
    });
    await writeAudit(ctx, {
      actor: ctx.admin,
      action: "admin.add",
      targetKind: "admin",
      targetId: adminId,
      before: null,
      after: { phone },
      note: cleanNote(args.note),
    });
    return { adminId };
  },
});

export const remove = adminMutation({
  args: { adminId: v.id("admins"), note: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<null | { error: "last_admin" | "not_found" }> => {
    const target = await ctx.db.get(args.adminId);
    if (!target) return { error: "not_found" };
    const others = await ctx.db.query("admins").take(2);
    if (others.length < 2) return { error: "last_admin" };
    await deleteAdminSessions(ctx, target._id);
    // Pushes stop with the role (spec 4.3).
    const subscriptions = await ctx.db
      .query("adminPushSubscriptions")
      .withIndex("by_admin", (q) => q.eq("adminId", target._id))
      .collect();
    for (const s of subscriptions) await ctx.db.delete(s._id);
    await ctx.db.delete(target._id);
    await writeAudit(ctx, {
      actor: ctx.admin,
      action: "admin.remove",
      targetKind: "admin",
      targetId: target._id,
      before: { phone: target.phone },
      after: null,
      note: cleanNote(args.note),
    });
    return null;
  },
});
