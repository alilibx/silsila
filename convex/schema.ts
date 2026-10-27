import { defineSchema, defineTable } from "convex/server";
import { v, type VLiteral } from "convex/values";
import { SCHEDULES, type Schedule } from "./lib/schedule";

type ScheduleLiterals = [
  VLiteral<Schedule>,
  VLiteral<Schedule>,
  ...VLiteral<Schedule>[],
];

/** Derived from `SCHEDULES` so the validator can never drift from the helper module. */
const scheduleValidator = v.union(
  ...(SCHEDULES.map((s) => v.literal(s)) as ScheduleLiterals),
);

const nullableNumber = v.union(v.number(), v.null());

export default defineSchema({
  people: defineTable({
    phone: v.string(), // E.164
    displayName: v.string(),
    verifiedAt: v.number(),
    timeZone: v.string(),
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
    status: v.union(v.literal("active"), v.literal("blocked")),
    nudgesOn: v.boolean(),
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
  })
    .index("by_round_juz", ["roundId", "juz"])
    .index("by_khatma_person", ["khatmaId", "personId"])
    .index("by_round", ["roundId"]),

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
