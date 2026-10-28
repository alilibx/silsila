import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/adminSession";
import { writeAudit } from "./lib/audit";
import { scheduleHelpReplyPush } from "./push";

const MAX_REPLY = 1000;
/** `counts` reads at most this many open requests; the inbox shows "99+" above that. */
const COUNT_CAP = 100;
const FIRST_LINE = 120;

const statusValidator = v.union(
  v.literal("open"),
  v.literal("answered"),
  v.literal("closed"),
);

async function messagesOf(ctx: QueryCtx, request: Doc<"helpRequests">) {
  return await ctx.db
    .query("helpMessages")
    .withIndex("by_request", (q) => q.eq("requestId", request._id))
    .collect();
}

/** Open requests and how long the oldest has waited (spec 5). */
export const counts = adminQuery({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("helpRequests")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(COUNT_CAP);
    return {
      open: open.length,
      oldestOpenAt:
        open.length === 0 ? null : Math.min(...open.map((r) => r.createdAt)),
    };
  },
});

/** The inbox: open requests oldest first, the others newest first. */
export const list = adminQuery({
  args: { status: statusValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("helpRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order(args.status === "open" ? "asc" : "desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (r) => {
          const messages = await messagesOf(ctx, r);
          const first = messages.find((m) => m.text !== null);
          const person = r.personId ? await ctx.db.get(r.personId) : null;
          const khatma = r.khatmaId ? await ctx.db.get(r.khatmaId) : null;
          return {
            _id: r._id,
            status: r.status,
            createdAt: r.createdAt,
            lastMessageAt: r.lastMessageAt,
            firstLine: first?.text?.split("\n")[0]?.slice(0, FIRST_LINE) ?? "",
            hasVoice: messages.some((m) => m.voiceId !== null),
            hasScreenshot: messages.some((m) => m.screenshotId !== null),
            // null for a visitor; the admin app says "زائر"
            who: person?.displayName ?? null,
            khatmaName: khatma ? (khatma.name ?? "") : null,
          };
        }),
      ),
    };
  },
});

/** One conversation with everything an admin needs to help (spec 5). */
export const get = adminQuery({
  args: { requestId: v.id("helpRequests") },
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.requestId);
    if (!r) return null;
    const person = r.personId ? await ctx.db.get(r.personId) : null;
    const khatma = r.khatmaId ? await ctx.db.get(r.khatmaId) : null;
    return {
      _id: r._id,
      status: r.status,
      createdAt: r.createdAt,
      context: r.context,
      attachmentsDeletedAt: r.attachmentsDeletedAt,
      person: person
        ? {
            personId: person._id,
            displayName: person.displayName,
            phone: person.phone,
          }
        : null,
      khatma: khatma
        ? {
            khatmaId: khatma._id,
            name: khatma.name,
            inviteCode: khatma.inviteCode,
          }
        : null,
      messages: await Promise.all(
        (await messagesOf(ctx, r)).map(async (m) => ({
          _id: m._id,
          from: m.from,
          text: m.text,
          screenshotUrl: m.screenshotId
            ? await ctx.storage.getUrl(m.screenshotId)
            : null,
          voiceUrl: m.voiceId ? await ctx.storage.getUrl(m.voiceId) : null,
          voiceSeconds: m.voiceSeconds,
          // Files deleted by retention leave the message with a note to show.
          hadAttachment:
            m.screenshotId !== null ||
            m.voiceId !== null ||
            m.filesDeletedAt !== undefined,
          createdAt: m.createdAt,
        })),
      ),
    };
  },
});

/**
 * A team reply, signed "فريق وِردك" by the apps, never with the admin's name.
 * Replies aren't audit rows: the conversation is the record (spec 4.5).
 */
export const reply = adminMutation({
  args: { requestId: v.id("helpRequests"), text: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "empty" | "too_long" | "not_found" }> => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return { error: "not_found" };
    const text = args.text.trim();
    if (text === "") return { error: "empty" };
    if (text.length > MAX_REPLY) return { error: "too_long" };
    const now = Date.now();
    const messageId = await ctx.db.insert("helpMessages", {
      requestId: request._id,
      from: "team",
      text,
      screenshotId: null,
      voiceId: null,
      voiceSeconds: null,
      createdAt: now,
    });
    await ctx.db.patch(request._id, {
      status: "answered",
      answeredAt: now,
      lastMessageAt: now,
      closedAt: null,
    });
    await scheduleHelpReplyPush(ctx, messageId, request.personId);
    return { ok: true };
  },
});

export const close = adminMutation({
  args: { requestId: v.id("helpRequests") },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" }> => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return { error: "not_found" };
    if (request.status === "closed") return { ok: true };
    await ctx.db.patch(request._id, { status: "closed", closedAt: Date.now() });
    await writeAudit(ctx, {
      actor: ctx.admin,
      action: "help.close",
      targetKind: "help",
      targetId: request._id,
      before: request.status,
      after: "closed",
    });
    return { ok: true };
  },
});

export const reopen = adminMutation({
  args: { requestId: v.id("helpRequests") },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: true } | { error: "not_found" }> => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return { error: "not_found" };
    if (request.status !== "closed") return { ok: true };
    await ctx.db.patch(request._id, { status: "open", closedAt: null });
    await writeAudit(ctx, {
      actor: ctx.admin,
      action: "help.reopen",
      targetKind: "help",
      targetId: request._id,
      before: "closed",
      after: "open",
    });
    return { ok: true };
  },
});
