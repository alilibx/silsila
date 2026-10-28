import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import {
  ADMIN_SESSION_TTL_MS,
  adminMutation,
  deleteAdminSessions,
  resolveAdminSession,
} from "./lib/adminSession";
import { randomToken, sha256Hex, timingSafeEqual } from "./lib/crypto";
import { normalizeDigits } from "./lib/digits";
import { getSetting } from "./lib/settings";
import { cleanDeviceLabel } from "./verification";
import { adminSignInAlert, sendWhatsAppText } from "./whatsapp";

type ConfirmResult =
  | { kind: "ok"; phone: string }
  | { kind: "expired" | "wrong_pin" | "too_many_attempts" };

/**
 * Checks the code for an admin panel verification and opens an admin session.
 * The PIN is checked before the allowlist, so a number that isn't an admin
 * sees the same answers as an admin with a stale code (spec 4.2).
 */
export const confirmPinInternal = internalMutation({
  args: {
    verificationId: v.id("verifications"),
    secretHash: v.string(),
    pinHash: v.string(),
    tokenHash: v.string(),
    alertTokenHash: v.string(),
    deviceLabel: v.string(),
  },
  handler: async (ctx, args): Promise<ConfirmResult> => {
    const doc = await ctx.db.get(args.verificationId);
    if (!doc || !timingSafeEqual(args.secretHash, doc.secretHash)) {
      return { kind: "expired" };
    }
    if (Date.now() >= doc.expiresAt) return { kind: "expired" };
    if (doc.surface !== "admin") return { kind: "expired" };
    if (doc.status !== "needs_pin" || !doc.pinHash || !doc.phone) {
      return { kind: "expired" };
    }
    if (doc.pinAttempts >= (await getSetting(ctx, "pinMaxAttempts"))) {
      return { kind: "too_many_attempts" };
    }
    if (!timingSafeEqual(args.pinHash, doc.pinHash)) {
      await ctx.db.patch(doc._id, { pinAttempts: doc.pinAttempts + 1 });
      return { kind: "wrong_pin" };
    }
    // The admin may have been removed since the code was sent.
    const admin = doc.adminId ? await ctx.db.get(doc.adminId) : null;
    if (!admin || admin.phone !== doc.phone) return { kind: "expired" };

    const now = Date.now();
    await ctx.db.insert("adminSessions", {
      adminId: admin._id,
      tokenHash: args.tokenHash,
      alertTokenHash: args.alertTokenHash,
      deviceLabel: args.deviceLabel,
      createdAt: now,
      expiresAt: now + ADMIN_SESSION_TTL_MS,
    });
    await ctx.db.patch(doc._id, { status: "claimed", pinHash: undefined });
    return { kind: "ok", phone: doc.phone };
  },
});

export const confirmPin = action({
  args: {
    verificationId: v.id("verifications"),
    secret: v.string(),
    pin: v.string(),
    deviceLabel: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { adminToken: string }
    | { error: "wrong_pin" | "too_many_attempts" | "expired" }
  > => {
    const adminToken = randomToken(32);
    const alertToken = randomToken(32);
    const deviceLabel = cleanDeviceLabel(args.deviceLabel);
    // "123 456", " ١٢٣٤٥٦ " and "123456" are the same PIN.
    const pin = normalizeDigits(args.pin.slice(0, 64)).replace(/\s+/gu, "");
    const res = await ctx.runMutation(internal.adminAuth.confirmPinInternal, {
      verificationId: args.verificationId,
      secretHash: await sha256Hex(args.secret),
      pinHash: await sha256Hex(pin),
      tokenHash: await sha256Hex(adminToken),
      alertTokenHash: await sha256Hex(alertToken),
      deviceLabel,
    });
    if (res.kind !== "ok") return { error: res.kind };
    await sendWhatsAppText(
      res.phone,
      adminSignInAlert(deviceLabel, alertToken),
    );
    return { adminToken };
  },
});

/** The signed-in admin, or null. Never throws, so the app can show sign-in. */
export const me = query({
  args: { adminToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const resolved = await resolveAdminSession(ctx, args.adminToken);
    if (!resolved) return null;
    return {
      adminId: resolved.admin._id,
      phone: resolved.admin.phone,
      expiresAt: resolved.session.expiresAt,
    };
  },
});

export const signOut = adminMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await ctx.db.delete(ctx.session._id);
    return null;
  },
});

/** The sign-in alert's link: ends every session of the admin it was sent to. */
export const signOutByAlertToken = mutation({
  args: { alertToken: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const alertTokenHash = await sha256Hex(args.alertToken.slice(0, 200));
    const alerted = await ctx.db
      .query("adminSessions")
      .withIndex("by_alertTokenHash", (q) =>
        q.eq("alertTokenHash", alertTokenHash),
      )
      .first();
    if (!alerted) return { ok: false };
    await deleteAdminSessions(ctx, alerted.adminId);
    return { ok: true };
  },
});
