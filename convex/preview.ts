import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { khatmaByInviteCode } from "./lib/khatma";
import { checkRateLimit } from "./lib/rateLimit";
import { getSetting } from "./lib/settings";
import { doneCount, roundAssignments } from "./rounds";

/** `randomToken(8)` is 11 base64url characters (same rule as `khatmas.view`). */
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{11}$/;
const MINUTE_MS = 60_000;

export type PreviewData = {
  name: string | null;
  createdAt: number;
  done: number;
  round: number;
  inviterName: string | null;
};

/**
 * What a link preview may show about a khatma: its name, progress and the
 * inviter. Public by design: the invite code is the capability, and nothing
 * here names a reader or says how long anything was held. The inviter shows
 * only for the share token of an active member, as in `khatmas.view`.
 */
export const lookup = internalQuery({
  args: { inviteCode: v.string(), from: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<PreviewData | null> => {
    const khatma = await khatmaByInviteCode(ctx, args.inviteCode);
    if (!khatma || !khatma.currentRoundId) return null;
    const round = await ctx.db.get(khatma.currentRoundId);
    if (!round) return null;

    let inviterName: string | null = null;
    const from = args.from;
    if (from !== null && SHARE_TOKEN_RE.test(from)) {
      const members = await ctx.db
        .query("members")
        .withIndex("by_khatma", (q) => q.eq("khatmaId", khatma._id))
        .collect();
      const inviter = members.find(
        (m) => m.status === "active" && m.shareToken === from,
      );
      if (inviter) {
        inviterName = (await ctx.db.get(inviter.personId))?.displayName ?? null;
      }
    }

    return {
      name: khatma.name,
      createdAt: khatma.createdAt,
      done: doneCount(await roundAssignments(ctx, round._id)),
      round: round.number,
      inviterName,
    };
  },
});

/** Counts one preview hit from `ip`; `false` once the per-minute limit is spent. */
export const allowHit = internalMutation({
  args: { ip: v.string() },
  handler: async (ctx, args): Promise<boolean> =>
    await checkRateLimit(
      ctx,
      `preview:ip:${args.ip}`,
      await getSetting(ctx, "previewPerIpPerMinute"),
      MINUTE_MS,
    ),
});
