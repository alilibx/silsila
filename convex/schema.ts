import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { graceValidator } from "./lib/grace";
import { scheduleValidator } from "./lib/schedule";

const nullableNumber = v.union(v.number(), v.null());

export default defineSchema({
  people: defineTable({
    phone: v.string(), // E.164
    displayName: v.string(),
    verifiedAt: v.number(),
    timeZone: v.string(),
    lastSeenAt: v.number(),
  }).index("by_phone", ["phone"]),

  sessions: defineTable({
    personId: v.id("people"),
    tokenHash: v.string(),
    alertTokenHash: v.string(),
    deviceLabel: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_alertTokenHash", ["alertTokenHash"])
    .index("by_person", ["personId"]),

  verifications: defineTable({
    codeNormalized: v.string(),
    secretHash: v.string(),
    displayName: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("matched"),
      v.literal("needs_pin"),
      v.literal("claimed"),
      v.literal("rejected"),
      v.literal("expired"),
    ),
    phone: v.optional(v.string()),
    pinHash: v.optional(v.string()),
    pinAttempts: v.number(),
    existingPersonId: v.optional(v.id("people")),
    /** The site path the sign-in started on; the WhatsApp reply links back to it. */
    returnPath: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_code_status", ["codeNormalized", "status"])
    .index("by_createdAt", ["createdAt"]),

  inboundMessages: defineTable({
    waMessageId: v.string(),
    receivedAt: v.number(),
  })
    .index("by_waMessageId", ["waMessageId"])
    .index("by_receivedAt", ["receivedAt"]),

  khatmas: defineTable({
    name: v.union(v.string(), v.null()),
    schedule: scheduleValidator,
    grace: graceValidator,
    creatorPersonId: v.id("people"),
    inviteCode: v.string(),
    currentRoundId: v.optional(v.id("rounds")),
    completedRounds: v.number(),
    createdAt: v.number(),
  }).index("by_inviteCode", ["inviteCode"]),

  members: defineTable({
    khatmaId: v.id("khatmas"),
    personId: v.id("people"),
    joinedAt: v.number(),
    shareToken: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("blocked"),
      // An unblocked person who isn't a member; `take` reactivates the row.
      v.literal("former"),
    ),
    notificationsOn: v.boolean(),
    lastNudgeAt: nullableNumber,
    lastCelebratedRound: v.number(),
  })
    .index("by_khatma", ["khatmaId"])
    .index("by_person", ["personId"])
    .index("by_khatma_person", ["khatmaId", "personId"])
    .index("by_shareToken", ["shareToken"]),

  rounds: defineTable({
    khatmaId: v.id("khatmas"),
    number: v.number(),
    startedAt: v.number(),
    targetEndAt: nullableNumber,
    completedAt: nullableNumber,
    lastFinishedAt: nullableNumber,
    behindInvitedAt: nullableNumber,
  }).index("by_khatma_number", ["khatmaId", "number"]),

  assignments: defineTable({
    khatmaId: v.id("khatmas"),
    roundId: v.id("rounds"),
    roundNumber: v.number(),
    juz: v.number(),
    memberId: v.id("members"),
    personId: v.id("people"),
    takenAt: v.number(),
    finishedAt: nullableNumber,
    releasedAt: nullableNumber,
    releasedBySystem: v.boolean(),
    graceWakingMs: v.number(),
    noticeAt: v.number(),
    graceEndsAt: v.number(),
    extended: v.boolean(),
    noticeSentAt: nullableNumber,
    openedForHelpAt: nullableNumber,
    remindedAt: nullableNumber,
  })
    .index("by_round_juz", ["roundId", "juz"])
    .index("by_khatma_person", ["khatmaId", "personId"])
    .index("by_round", ["roundId"])
    .index("by_person_finishedAt", ["personId", "finishedAt"]),

  notes: defineTable({
    personId: v.id("people"),
    khatmaId: v.id("khatmas"),
    kind: v.union(
      v.literal("almostUp"),
      v.literal("openForHelp"),
      v.literal("thanks"),
      v.literal("reminder"),
      v.literal("behind"),
      v.literal("completed"),
      v.literal("nowOrganizer"),
      v.literal("organizerMoved"),
    ),
    juz: v.array(v.number()),
    count: nullableNumber,
    until: nullableNumber,
    assignmentId: v.union(v.id("assignments"), v.null()),
    roundNumber: nullableNumber,
    createdAt: v.number(),
    pushedAt: nullableNumber,
    clearedAt: nullableNumber,
  })
    .index("by_person_khatma", ["personId", "khatmaId", "clearedAt"])
    .index("by_khatma_kind", ["khatmaId", "kind", "clearedAt"])
    .index("by_assignment", ["assignmentId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_clearedAt", ["clearedAt"]),

  pushSubscriptions: defineTable({
    personId: v.id("people"),
    sessionId: v.id("sessions"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_person", ["personId"])
    .index("by_session", ["sessionId"])
    .index("by_endpoint", ["endpoint"]),

  handoffTokens: defineTable({
    tokenHash: v.string(),
    personId: v.id("people"),
    sessionId: v.id("sessions"),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: nullableNumber,
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_session", ["sessionId"])
    .index("by_createdAt", ["createdAt"]),

  settings: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    /** windowStart + windowMs; expired windows carry no information and are purged. */
    expiresAt: v.number(),
    count: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiresAt", ["expiresAt"]),
});
