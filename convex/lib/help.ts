import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { checkFile, VOICE_MAX_SECONDS } from "./helpFiles";
import { khatmaByInviteCode } from "./khatma";

const MAX_TEXT = 1000;

export type HelpInput = {
  text: string | null;
  screenshotId: Id<"_storage"> | null;
  voiceId: Id<"_storage"> | null;
  voiceSeconds: number | null;
};

export type HelpError = "empty" | "bad_file" | "too_long";

/** The help message fields every entry point takes. */
export const helpInputArgs = {
  text: v.optional(v.string()),
  screenshotId: v.optional(v.id("_storage")),
  voiceId: v.optional(v.id("_storage")),
  voiceSeconds: v.optional(v.number()),
};

export const helpContextValidator = v.object({
  path: v.string(),
  appVersion: v.string(),
  userAgent: v.string(),
  screen: v.string(),
  timeZone: v.string(),
});
export type HelpContext = Infer<typeof helpContextValidator>;

function capped(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.slice(0, max) : "";
}

/** The context the browser sent, reduced to spec 3.3's fields and capped. */
export function cleanContext(raw: unknown): HelpContext {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    path: capped(r.path, 200),
    appVersion: capped(r.appVersion, 200),
    userAgent: capped(r.userAgent, 300),
    screen: capped(r.screen, 200),
    timeZone: capped(r.timeZone, 200),
  };
}

/**
 * Checks one message: trimmed text up to 1,000 characters, text or a voice
 * note (a screenshot alone says too little), and files that pass `checkFile`.
 * Follow-ups pass `allowScreenshot: false`; a screenshot sent anyway is refused.
 */
export async function cleanHelpInput(
  ctx: MutationCtx,
  input: HelpInput,
  allowScreenshot: boolean,
): Promise<HelpInput | { error: HelpError }> {
  const text = input.text?.trim() ? input.text.trim() : null;
  if (text !== null && text.length > MAX_TEXT) return { error: "too_long" };
  if (input.screenshotId !== null) {
    if (!allowScreenshot) {
      await ctx.storage.delete(input.screenshotId);
      return { error: "bad_file" };
    }
    if (!(await checkFile(ctx, input.screenshotId, "screenshot"))) {
      return { error: "bad_file" };
    }
  }
  let voiceSeconds: number | null = null;
  if (input.voiceId !== null) {
    const seconds = Math.round(input.voiceSeconds ?? 0);
    if (seconds < 1 || seconds > VOICE_MAX_SECONDS) {
      await ctx.storage.delete(input.voiceId);
      return { error: "bad_file" };
    }
    if (!(await checkFile(ctx, input.voiceId, "voice"))) {
      return { error: "bad_file" };
    }
    voiceSeconds = seconds;
  }
  if (text === null && input.voiceId === null) return { error: "empty" };
  return {
    text,
    screenshotId: input.screenshotId,
    voiceId: input.voiceId,
    voiceSeconds,
  };
}

/** Optional message args to a `HelpInput`. */
export function toHelpInput(args: {
  text?: string;
  screenshotId?: Id<"_storage">;
  voiceId?: Id<"_storage">;
  voiceSeconds?: number;
}): HelpInput {
  return {
    text: args.text ?? null,
    screenshotId: args.screenshotId ?? null,
    voiceId: args.voiceId ?? null,
    voiceSeconds: args.voiceSeconds ?? null,
  };
}

export type HelpOwner = { personId: Id<"people"> } | { reporterHash: string };

/** True when `owner` is the person or visitor the request belongs to. */
export function owns(request: Doc<"helpRequests">, owner: HelpOwner): boolean {
  return "personId" in owner
    ? request.personId === owner.personId
    : request.reporterHash === owner.reporterHash;
}

/** Tells the admins about a new request or message, right away (spec 7). */
export async function notifyAdmins(
  ctx: MutationCtx,
  requestId: Id<"helpRequests">,
  kind: "request" | "message",
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.pushNode.deliverToAdmins, {
    requestId,
    kind,
  });
}

/** The khatma behind `inviteCode`, if the owner may name it: any visitor, or a member of it. */
async function requestKhatma(
  ctx: QueryCtx,
  owner: HelpOwner,
  inviteCode: string | null,
): Promise<Id<"khatmas"> | null> {
  if (inviteCode === null) return null;
  const khatma = await khatmaByInviteCode(ctx, inviteCode);
  if (!khatma) return null;
  if (!("personId" in owner)) return khatma._id;
  const membership = await ctx.db
    .query("members")
    .withIndex("by_khatma_person", (q) =>
      q.eq("khatmaId", khatma._id).eq("personId", owner.personId),
    )
    .first();
  return membership?.status === "active" ? khatma._id : null;
}

/** Opens a request with its first message. The input is already cleaned. */
export async function createRequest(
  ctx: MutationCtx,
  args: {
    owner: HelpOwner;
    inviteCode: string | null;
    input: HelpInput;
    context: HelpContext;
  },
): Promise<Id<"helpRequests">> {
  const now = Date.now();
  const isPerson = "personId" in args.owner;
  const requestId = await ctx.db.insert("helpRequests", {
    personId: isPerson
      ? (args.owner as { personId: Id<"people"> }).personId
      : null,
    reporterHash: isPerson
      ? null
      : (args.owner as { reporterHash: string }).reporterHash,
    khatmaId: await requestKhatma(ctx, args.owner, args.inviteCode),
    status: "open",
    context: args.context,
    createdAt: now,
    lastMessageAt: now,
    answeredAt: null,
    closedAt: null,
    seenAt: null,
    attachmentsDeletedAt: null,
  });
  await ctx.db.insert("helpMessages", {
    requestId,
    from: isPerson ? "person" : "visitor",
    ...args.input,
    createdAt: now,
  });
  await notifyAdmins(ctx, requestId, "request");
  return requestId;
}

/** A follow-up from the person or visitor. It reopens a closed request. */
export async function addMessage(
  ctx: MutationCtx,
  request: Doc<"helpRequests">,
  from: "person" | "visitor",
  input: HelpInput,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("helpMessages", {
    requestId: request._id,
    from,
    ...input,
    createdAt: now,
  });
  await ctx.db.patch(request._id, {
    status: "open",
    lastMessageAt: now,
    closedAt: null,
  });
  await notifyAdmins(ctx, request._id, "message");
}
