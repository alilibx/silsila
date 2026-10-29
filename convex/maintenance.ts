import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getSetting } from "./lib/settings";
import { dubaiDay } from "./lib/stats";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Days a sign-in counter is kept after its day. */
const SIGNIN_COUNTER_DAYS = 7;

/** Max rows deleted per table per run, keeping each mutation well under Convex limits. */
const BATCH = 500;

/**
 * Retention: rate-limit rows (which may be IP-keyed) are purged as soon as their
 * window has expired (`expiresAt < now`), so an IP is held at most as long as its
 * window (spec 9: at most 24 hours). Phone numbers in verifications and in
 * WhatsApp windows (`waContacts`) 24 hours; WhatsApp dedupe ids 7 days.
 */
const INBOUND_TTL_MS = 7 * DAY_MS;
const VERIFICATION_TTL_MS = DAY_MS;
const HANDOFF_TTL_MS = DAY_MS;
/** A phone's 24-hour WhatsApp window: once it has closed, the row says nothing. */
const WA_CONTACT_TTL_MS = DAY_MS;
/** Audit rows are kept 2 years (spec 4.5). */
export const AUDIT_TTL_MS = 2 * 365 * DAY_MS;

/**
 * Help requests per run. Each one reads and writes all its messages (up to
 * MAX_MESSAGES_PER_REQUEST), so the batch is far smaller than BATCH.
 */
const HELP_BATCH = 20;
const ORPHAN_BATCH = 200;

/** Uploads younger than this may still be on their way into a message. */
const ORPHAN_AGE_MS = HOUR_MS;
const ORPHAN_MARK = "helpOrphans";

async function deleteFiles(
  ctx: MutationCtx,
  ids: (Id<"_storage"> | null)[],
): Promise<void> {
  for (const id of ids) {
    if (id !== null && (await ctx.db.system.get(id))) {
      await ctx.storage.delete(id);
    }
  }
}

/**
 * Help retention (plan 3 spec 3.6): files go `helpAttachmentRetentionMs`
 * after a request closes, the whole conversation `helpRetentionMs` after.
 * Returns true when more are due.
 */
async function purgeHelp(ctx: MutationCtx, now: number): Promise<boolean> {
  const fileCutoff = now - (await getSetting(ctx, "helpAttachmentRetentionMs"));
  const allCutoff = now - (await getSetting(ctx, "helpRetentionMs"));

  // Whole conversations first, so their files go with them. `gt(0)` keeps the
  // null of a request that isn't closed out of the range.
  const expired = await ctx.db
    .query("helpRequests")
    .withIndex("by_closedAt", (q) =>
      q.gt("closedAt", 0).lt("closedAt", allCutoff),
    )
    .take(BATCH + 1);
  for (const request of expired.slice(0, BATCH)) {
    const messages = await messagesOf(ctx, request._id);
    await deleteFiles(
      ctx,
      messages.flatMap((m) => [m.screenshotId, m.voiceId]),
    );
    for (const m of messages) await ctx.db.delete(m._id);
    await ctx.db.delete(request._id);
  }

  // Then files only, for requests whose files are still there.
  const withFiles = await ctx.db
    .query("helpRequests")
    .withIndex("by_attachments_closedAt", (q) =>
      q
        .eq("attachmentsDeletedAt", null)
        .gt("closedAt", 0)
        .lt("closedAt", fileCutoff),
    )
    .take(HELP_BATCH + 1);
  for (const request of withFiles.slice(0, HELP_BATCH)) {
    const messages = await messagesOf(ctx, request._id);
    await deleteFiles(
      ctx,
      messages.flatMap((m) => [m.screenshotId, m.voiceId]),
    );
    for (const m of messages) {
      if (m.screenshotId !== null || m.voiceId !== null) {
        await ctx.db.patch(m._id, {
          screenshotId: null,
          voiceId: null,
          filesDeletedAt: now,
        });
      }
    }
    await ctx.db.patch(request._id, { attachmentsDeletedAt: now });
  }
  return expired.length > HELP_BATCH || withFiles.length > HELP_BATCH;
}

function messagesOf(ctx: MutationCtx, requestId: Id<"helpRequests">) {
  return ctx.db
    .query("helpMessages")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .collect();
}

/**
 * Deletes uploads no help message references, once they're an hour old. Help
 * is the only user of file storage. Walks `_storage` from a saved mark so each
 * file is checked once.
 */
async function purgeOrphanUploads(
  ctx: MutationCtx,
  now: number,
): Promise<boolean> {
  const markRow = await ctx.db
    .query("sweepMarks")
    .withIndex("by_name", (q) => q.eq("name", ORPHAN_MARK))
    .first();
  const mark = markRow?.value ?? 0;
  const files = await ctx.db.system
    .query("_storage")
    .withIndex("by_creation_time", (q) =>
      q.gt("_creationTime", mark).lt("_creationTime", now - ORPHAN_AGE_MS),
    )
    .take(ORPHAN_BATCH + 1);
  const batch = files.slice(0, ORPHAN_BATCH);
  for (const file of batch) {
    const used =
      (await ctx.db
        .query("helpMessages")
        .withIndex("by_screenshot", (q) => q.eq("screenshotId", file._id))
        .first()) ??
      (await ctx.db
        .query("helpMessages")
        .withIndex("by_voice", (q) => q.eq("voiceId", file._id))
        .first());
    if (!used) await ctx.storage.delete(file._id);
  }
  const last = batch.at(-1);
  if (last) {
    if (markRow) await ctx.db.patch(markRow._id, { value: last._creationTime });
    else {
      await ctx.db.insert("sweepMarks", {
        name: ORPHAN_MARK,
        value: last._creationTime,
      });
    }
  }
  return files.length > ORPHAN_BATCH;
}

/** Deletes up to BATCH rows; returns true when more old rows remain. */
async function deleteBatch(
  ctx: MutationCtx,
  rows: {
    _id: Id<
      | "rateLimits"
      | "inboundMessages"
      | "verifications"
      | "notes"
      | "handoffTokens"
      | "auditLog"
      | "adminSessions"
      | "counters"
      | "waContacts"
    >;
  }[],
): Promise<boolean> {
  for (const row of rows.slice(0, BATCH)) await ctx.db.delete(row._id);
  return rows.length > BATCH;
}

export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const notesRetention = await getSetting(ctx, "notesRetentionMs");
    const notesUnclearedCap = await getSetting(ctx, "notesUnclearedCapMs");

    const rateLimits = await ctx.db
      .query("rateLimits")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(BATCH + 1);
    const inbound = await ctx.db
      .query("inboundMessages")
      .withIndex("by_receivedAt", (q) =>
        q.lt("receivedAt", now - INBOUND_TTL_MS),
      )
      .take(BATCH + 1);
    const verifications = await ctx.db
      .query("verifications")
      .withIndex("by_createdAt", (q) =>
        q.lt("createdAt", now - VERIFICATION_TTL_MS),
      )
      .take(BATCH + 1);

    // Notes stay while they apply (a monthly round outlives 30 days, and its
    // `behind` notes are how nobody is invited twice in a round). Cleared notes
    // go `notesRetention` after clearing. `gt(0)` keeps the `null` of an
    // uncleared note out of the range. An uncleared note is deleted only past
    // the safety cap. A note can match both, so merge by id.
    const clearedNotes = await ctx.db
      .query("notes")
      .withIndex("by_clearedAt", (q) =>
        q.gt("clearedAt", 0).lt("clearedAt", now - notesRetention),
      )
      .take(BATCH + 1);
    const cappedNotes = await ctx.db
      .query("notes")
      .withIndex("by_createdAt", (q) =>
        q.lt("createdAt", now - notesUnclearedCap),
      )
      .take(BATCH + 1);
    const notes = [
      ...new Map(
        [...clearedNotes, ...cappedNotes].map((n) => [n._id, n] as const),
      ).values(),
    ];
    const waContacts = await ctx.db
      .query("waContacts")
      .withIndex("by_lastInboundAt", (q) =>
        q.lt("lastInboundAt", now - WA_CONTACT_TTL_MS),
      )
      .take(BATCH + 1);
    const handoffs = await ctx.db
      .query("handoffTokens")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - HANDOFF_TTL_MS))
      .take(BATCH + 1);

    const audit = await ctx.db
      .query("auditLog")
      .withIndex("by_at", (q) => q.lt("at", now - AUDIT_TTL_MS))
      .take(BATCH + 1);
    // An expired admin session can never be used again (12 hours, spec 4.2).
    const adminSessions = await ctx.db
      .query("adminSessions")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(BATCH + 1);

    // Sign-in counters are read by the nightly rollup; a week later they're spent.
    const signInCutoff = dubaiDay(now) - SIGNIN_COUNTER_DAYS;
    const signInCounters = (
      await ctx.db
        .query("counters")
        .withIndex("by_key", (q) =>
          q.gte("key", "signin:").lt("key", "signin;"),
        )
        .take(BATCH + 1)
    ).filter((c) => Number(c.key.split(":")[1]) < signInCutoff);

    const more = [
      await deleteBatch(ctx, rateLimits),
      await deleteBatch(ctx, signInCounters),
      await deleteBatch(ctx, inbound),
      await deleteBatch(ctx, verifications),
      await deleteBatch(ctx, waContacts),
      await deleteBatch(ctx, notes),
      await deleteBatch(ctx, handoffs),
      await deleteBatch(ctx, audit),
      await deleteBatch(ctx, adminSessions),
    ].some(Boolean);

    if (more) await ctx.scheduler.runAfter(0, internal.maintenance.purge, {});
  },
});

/**
 * Help retention and orphaned uploads, in small batches (plan 3 spec 3.6).
 * Its own hourly cron, apart from `purge`, so a help backlog can never fail
 * the purge, and only one chain runs at a time.
 */
export const purgeHelpData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const more = [
      await purgeHelp(ctx, now),
      await purgeOrphanUploads(ctx, now),
    ].some(Boolean);
    if (more) {
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeHelpData, {});
    }
  },
});
