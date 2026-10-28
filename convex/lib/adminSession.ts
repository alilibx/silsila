import { ConvexError, v } from "convex/values";
import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { sha256Hex } from "./crypto";

/** Admin sessions end this long after sign-in, however active the admin is (spec 4.2). */
export const ADMIN_SESSION_TTL_MS = 12 * 3_600_000;

export type AdminContext = {
  admin: Doc<"admins">;
  session: Doc<"adminSessions">;
};

/**
 * Resolves a raw admin token to its live session and admin. A missing,
 * unknown, or expired token, or one whose admin was removed, yields null.
 * Member session tokens live in another table, so they never resolve here.
 */
export async function resolveAdminSession(
  ctx: QueryCtx | MutationCtx,
  adminToken: string | undefined,
): Promise<AdminContext | null> {
  if (!adminToken) return null;
  const tokenHash = await sha256Hex(adminToken);
  const session = await ctx.db
    .query("adminSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session || Date.now() >= session.expiresAt) return null;
  const admin = await ctx.db.get(session.adminId);
  if (!admin) return null;
  return { admin, session };
}

async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
  adminToken: string,
): Promise<AdminContext> {
  const resolved = await resolveAdminSession(ctx, adminToken);
  if (!resolved) throw new ConvexError({ code: "not_admin" });
  return resolved;
}

// `adminToken` is required, so a member page can't reach these by passing its
// optional `sessionToken` by mistake.
const adminArgs = { adminToken: v.string() };

/** A query only a signed-in admin can call. Puts `admin` and `session` on `ctx`. */
export const adminQuery = customQuery(query, {
  args: adminArgs,
  input: async (ctx, { adminToken }) => ({
    ctx: await requireAdmin(ctx, adminToken),
    args: {},
  }),
});

/** A mutation only a signed-in admin can call. Puts `admin` and `session` on `ctx`. */
export const adminMutation = customMutation(mutation, {
  args: adminArgs,
  input: async (ctx, { adminToken }) => ({
    ctx: await requireAdmin(ctx, adminToken),
    args: {},
  }),
});

/** Ends every session of one admin. Returns how many it deleted. */
export async function deleteAdminSessions(
  ctx: MutationCtx,
  adminId: Id<"admins">,
): Promise<number> {
  const sessions = await ctx.db
    .query("adminSessions")
    .withIndex("by_admin", (q) => q.eq("adminId", adminId))
    .collect();
  for (const s of sessions) await ctx.db.delete(s._id);
  return sessions.length;
}
