import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { sha256Hex } from "./lib/crypto";
import {
  addMessage,
  cleanContext,
  cleanHelpInput,
  createRequest,
  helpContextValidator,
  helpInputArgs,
  owns,
  toHelpInput,
  type HelpOwner,
} from "./lib/help";
import {
  checkRateLimits,
  shardedBucket,
  type RateLimitBucket,
} from "./lib/rateLimit";
import { requirePerson, resolveSession, sessionMutation } from "./lib/session";
import { getSetting } from "./lib/settings";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_TOKEN = 200;
/** How many requests `mine` returns, newest first. */
const MINE_LIMIT = 10;
const VISITOR_UPLOADS_GLOBAL_PER_HOUR = 300;
const VISITOR_UPLOADS_PER_IP_PER_HOUR = 30;

type SendError =
  "rate_limited" | "empty" | "bad_file" | "too_long" | "not_found";

/** The key a reporter token is stored and limited under; never the token itself. */
export async function reporterHash(token: string): Promise<string> {
  return await sha256Hex(token.slice(0, MAX_TOKEN));
}

function ownerKey(owner: HelpOwner): string {
  return "personId" in owner
    ? `person:${owner.personId}`
    : `visitor:${owner.reporterHash}`;
}

async function messageBucket(
  ctx: MutationCtx,
  owner: HelpOwner,
): Promise<RateLimitBucket> {
  return {
    key: `helpMsg:${ownerKey(owner)}`,
    limit: await getSetting(ctx, "helpMessagesPerHour"),
    windowMs: HOUR_MS,
  };
}

async function uploadBucket(
  ctx: MutationCtx,
  owner: HelpOwner,
): Promise<RateLimitBucket> {
  return {
    key: `helpUpload:${ownerKey(owner)}`,
    limit: await getSetting(ctx, "helpMessagesPerHour"),
    windowMs: HOUR_MS,
  };
}

/** The request if `owner` owns it. */
async function ownedRequest(
  ctx: QueryCtx,
  requestId: Id<"helpRequests">,
  owner: HelpOwner,
): Promise<Doc<"helpRequests"> | null> {
  const request = await ctx.db.get(requestId);
  return request && owns(request, owner) ? request : null;
}

/** Opens a request after the input checks and the creation limits. */
async function create(
  ctx: MutationCtx,
  args: {
    owner: HelpOwner;
    createBuckets: RateLimitBucket[];
    inviteCode: string | null;
    input: ReturnType<typeof toHelpInput>;
    context: unknown;
  },
): Promise<{ requestId: Id<"helpRequests"> } | { error: SendError }> {
  const input = await cleanHelpInput(ctx, args.input, true);
  if ("error" in input) return input;
  const allowed = await checkRateLimits(ctx, [
    ...args.createBuckets,
    await messageBucket(ctx, args.owner),
  ]);
  if (!allowed) return { error: "rate_limited" };
  const requestId = await createRequest(ctx, {
    owner: args.owner,
    inviteCode: args.inviteCode,
    input,
    context: cleanContext(args.context),
  });
  return { requestId };
}

/** A follow-up in a request the owner holds. */
async function followUp(
  ctx: MutationCtx,
  owner: HelpOwner,
  requestId: Id<"helpRequests">,
  rawInput: ReturnType<typeof toHelpInput>,
): Promise<{ requestId: Id<"helpRequests"> } | { error: SendError }> {
  const request = await ownedRequest(ctx, requestId, owner);
  if (!request) return { error: "not_found" };
  const input = await cleanHelpInput(ctx, rawInput, false);
  if ("error" in input) return input;
  if (!(await checkRateLimits(ctx, [await messageBucket(ctx, owner)]))) {
    return { error: "rate_limited" };
  }
  await addMessage(
    ctx,
    request,
    "personId" in owner ? "person" : "visitor",
    input,
  );
  return { requestId };
}

// ---------------------------------------------------------------------------
// Members

export const uploadUrl = sessionMutation({
  args: {},
  handler: async (ctx): Promise<string | { error: "rate_limited" }> => {
    const person = requirePerson(ctx);
    const owner = { personId: person._id };
    if (!(await checkRateLimits(ctx, [await uploadBucket(ctx, owner)]))) {
      return { error: "rate_limited" };
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/** A new request (no `requestId`) or a follow-up. Maintenance never blocks it. */
export const send = sessionMutation({
  args: {
    requestId: v.optional(v.id("helpRequests")),
    inviteCode: v.optional(v.string()),
    context: v.optional(v.any()),
    ...helpInputArgs,
  },
  handler: async (ctx, args) => {
    const person = requirePerson(ctx);
    const owner = { personId: person._id };
    const input = toHelpInput(args);
    if (args.requestId !== undefined) {
      return await followUp(ctx, owner, args.requestId, input);
    }
    return await create(ctx, {
      owner,
      createBuckets: [
        {
          key: `helpCreate:person:${person._id}`,
          limit: await getSetting(ctx, "helpRequestsPerPersonPerDay"),
          windowMs: DAY_MS,
        },
      ],
      inviteCode: args.inviteCode ?? null,
      input,
      context: args.context,
    });
  },
});

/** Moves the requests of this browser's reporter token to the signed-in account. */
export const claimVisitorRequests = sessionMutation({
  args: { reporterToken: v.string() },
  handler: async (ctx, args): Promise<{ moved: number }> => {
    const person = requirePerson(ctx);
    const hash = await reporterHash(args.reporterToken);
    const requests = await ctx.db
      .query("helpRequests")
      .withIndex("by_reporter", (q) => q.eq("reporterHash", hash))
      .collect();
    for (const r of requests) {
      await ctx.db.patch(r._id, { personId: person._id, reporterHash: null });
    }
    return { moved: requests.length };
  },
});

// ---------------------------------------------------------------------------
// Visitors (signed out). New requests come over HTTP (http.ts), where the
// per-IP limit can read the IP; these are the follow-ups.

/** An upload URL for a follow-up voice note. The token must own the request. */
export const uploadUrlAsVisitor = mutation({
  args: { reporterToken: v.string(), requestId: v.id("helpRequests") },
  handler: async (
    ctx,
    args,
  ): Promise<string | { error: "not_found" | "rate_limited" }> => {
    const owner = { reporterHash: await reporterHash(args.reporterToken) };
    // Tokens cost nothing to mint, so a token alone buys no upload URLs.
    if (!(await ownedRequest(ctx, args.requestId, owner))) {
      return { error: "not_found" };
    }
    const allowed = await checkRateLimits(ctx, [
      await uploadBucket(ctx, owner),
      shardedBucket(
        "helpUpload:visitorGlobal",
        VISITOR_UPLOADS_GLOBAL_PER_HOUR,
        HOUR_MS,
      ),
    ]);
    if (!allowed) return { error: "rate_limited" };
    return await ctx.storage.generateUploadUrl();
  },
});

export const sendAsVisitor = mutation({
  args: {
    reporterToken: v.string(),
    requestId: v.id("helpRequests"),
    ...helpInputArgs,
  },
  handler: async (ctx, args) => {
    const owner = { reporterHash: await reporterHash(args.reporterToken) };
    return await followUp(ctx, owner, args.requestId, toHelpInput(args));
  },
});

/** Called by `POST /api/help/request` with the caller's IP. */
export const createAsVisitorInternal = internalMutation({
  args: {
    reporterHash: v.string(),
    ip: v.union(v.string(), v.null()),
    inviteCode: v.union(v.string(), v.null()),
    text: v.union(v.string(), v.null()),
    screenshotId: v.union(v.id("_storage"), v.null()),
    voiceId: v.union(v.id("_storage"), v.null()),
    voiceSeconds: v.union(v.number(), v.null()),
    context: helpContextValidator,
  },
  handler: async (ctx, args) => {
    const owner = { reporterHash: args.reporterHash };
    const createBuckets: RateLimitBucket[] = [
      {
        key: `helpCreate:visitor:${args.reporterHash}`,
        limit: await getSetting(ctx, "helpRequestsPerVisitorPerDay"),
        windowMs: DAY_MS,
      },
    ];
    if (args.ip !== null) {
      createBuckets.push({
        key: `helpCreate:ip:${args.ip}`,
        limit: await getSetting(ctx, "helpRequestsPerIpPerDay"),
        windowMs: DAY_MS,
      });
    }
    return await create(ctx, {
      owner,
      createBuckets,
      inviteCode: args.inviteCode,
      input: {
        text: args.text,
        screenshotId: args.screenshotId,
        voiceId: args.voiceId,
        voiceSeconds: args.voiceSeconds,
      },
      context: args.context,
    });
  },
});

// ---------------------------------------------------------------------------
// Reading

/** The caller as a request owner: a session wins over a reporter token. */
async function callerOwner(
  ctx: QueryCtx,
  sessionToken: string | undefined,
  reporterToken: string | undefined,
): Promise<HelpOwner | null> {
  const { person } = await resolveSession(ctx, sessionToken);
  if (person) return { personId: person._id };
  if (reporterToken) return { reporterHash: await reporterHash(reporterToken) };
  return null;
}

/** The caller's latest requests with their messages, newest first. */
export const mine = query({
  args: {
    sessionToken: v.optional(v.string()),
    reporterToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await callerOwner(ctx, args.sessionToken, args.reporterToken);
    if (!owner) return [];
    const requests =
      "personId" in owner
        ? await ctx.db
            .query("helpRequests")
            .withIndex("by_person", (q) => q.eq("personId", owner.personId))
            .order("desc")
            .take(MINE_LIMIT)
        : await ctx.db
            .query("helpRequests")
            .withIndex("by_reporter", (q) =>
              q.eq("reporterHash", owner.reporterHash),
            )
            .order("desc")
            .take(MINE_LIMIT);
    return await Promise.all(
      requests.map(async (r) => {
        const messages = await ctx.db
          .query("helpMessages")
          .withIndex("by_request", (q) => q.eq("requestId", r._id))
          .collect();
        const last = messages.at(-1);
        const unread =
          last?.from === "team" &&
          (r.seenAt === null || r.seenAt < last.createdAt);
        return {
          _id: r._id,
          status: r.status,
          createdAt: r.createdAt,
          lastMessageAt: r.lastMessageAt,
          unread,
          messages: await Promise.all(
            messages.map(async (m) => ({
              _id: m._id,
              from: m.from,
              text: m.text,
              hasScreenshot: m.screenshotId !== null,
              voiceUrl: m.voiceId ? await ctx.storage.getUrl(m.voiceId) : null,
              voiceSeconds: m.voiceSeconds,
              createdAt: m.createdAt,
            })),
          ),
        };
      }),
    );
  },
});

/** The person opened the conversation: its team replies are no longer new. */
export const markSeen = mutation({
  args: {
    requestId: v.id("helpRequests"),
    sessionToken: v.optional(v.string()),
    reporterToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<null> => {
    const owner = await callerOwner(ctx, args.sessionToken, args.reporterToken);
    if (!owner) return null;
    const request = await ownedRequest(ctx, args.requestId, owner);
    if (request) await ctx.db.patch(request._id, { seenAt: Date.now() });
    return null;
  },
});

/** Called by `POST /api/help/upload-url` with the caller's IP. */
export const uploadUrlInternal = internalMutation({
  args: { reporterHash: v.string(), ip: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<string | { error: "rate_limited" }> => {
    const buckets: RateLimitBucket[] = [
      await uploadBucket(ctx, { reporterHash: args.reporterHash }),
      shardedBucket(
        "helpUpload:visitorGlobal",
        VISITOR_UPLOADS_GLOBAL_PER_HOUR,
        HOUR_MS,
      ),
    ];
    if (args.ip !== null) {
      buckets.push({
        key: `helpUpload:ip:${args.ip}`,
        limit: VISITOR_UPLOADS_PER_IP_PER_HOUR,
        windowMs: HOUR_MS,
      });
    }
    if (!(await checkRateLimits(ctx, buckets)))
      return { error: "rate_limited" };
    return await ctx.storage.generateUploadUrl();
  },
});
