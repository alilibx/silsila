import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** `randomToken(9)` is 12 base64url characters. */
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{12}$/;

/** The khatma behind an invite code, or `null` (malformed codes never reach the index). */
export async function khatmaByInviteCode(
  ctx: QueryCtx,
  inviteCode: string,
): Promise<Doc<"khatmas"> | null> {
  if (!INVITE_CODE_RE.test(inviteCode)) return null;
  return await ctx.db
    .query("khatmas")
    .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
    .first();
}

/** Whether a khatma is archived: read-only, and nothing runs on it any more. */
export function isArchived(khatma: Doc<"khatmas">): boolean {
  return khatma.archivedAt != null || khatma.rota?.archivedAt != null;
}
