import { ConvexError, v } from "convex/values";
import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { sha256Hex } from "./crypto";

/** `lastUsedAt` is refreshed at most this often per session. */
export const LAST_USED_REFRESH_MS = 3_600_000;

export type SessionContext = {
  person: Doc<"people"> | null;
  session: Doc<"sessions"> | null;
};

/**
 * Resolves a raw session token to its session and person. A missing, unknown,
 * or orphaned token yields nulls, never an error.
 */
export async function resolveSession(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string | undefined,
): Promise<SessionContext> {
  if (!sessionToken) return { person: null, session: null };
  const tokenHash = await sha256Hex(sessionToken);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session) return { person: null, session: null };
  const person = await ctx.db.get(session.personId);
  if (!person) return { person: null, session: null };
  return { person, session };
}

const sessionArgs = { sessionToken: v.optional(v.string()) };

/** A query that knows who is calling. Never writes; `sessionToken` is consumed here. */
export const sessionQuery = customQuery(query, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => ({
    ctx: await resolveSession(ctx, sessionToken),
    args: {},
  }),
});

/** A mutation that knows who is calling. Touches `lastUsedAt` at most once per hour. */
export const sessionMutation = customMutation(mutation, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => {
    const resolved = await resolveSession(ctx, sessionToken);
    const { session } = resolved;
    if (session && Date.now() - session.lastUsedAt >= LAST_USED_REFRESH_MS) {
      const lastUsedAt = Date.now();
      await ctx.db.patch(session._id, { lastUsedAt });
      resolved.session = { ...session, lastUsedAt };
    }
    return { ctx: resolved, args: {} };
  },
});

/** Returns the signed-in person or throws `not_signed_in`. */
export function requirePerson(ctx: SessionContext): Doc<"people"> {
  if (!ctx.person) throw new ConvexError({ code: "not_signed_in" });
  return ctx.person;
}
