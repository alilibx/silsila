import type { QueryCtx } from "../_generated/server";
import { DEFAULT_GRACE } from "./grace";
import type { QuietHours } from "./wakingTime";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SETTING_DEFAULTS = {
  maxMembers: 60,
  rotationLookbackRounds: 3,
  undoWindowMs: 10_000,
  completionDelayMs: 10_000,
  verificationTtlMs: 600_000,
  pinMaxAttempts: 5,
  verifyStartPerClientPer10Min: 5,
  /** looser than per-client: carrier NAT and shared home Wi-Fi put many people on one IP */
  verifyStartPerIpPer10Min: 30,
  verifyPerPhonePerHour: 10,
  verifyGlobalPerMinute: 120,
  /** take, finish, undo, release combined */
  poolActionsPerPersonPerMinute: 10,
  createsPerPersonPerDay: 5,
  newMembersPerKhatmaPerHour: 30,
  nameChangesPerPersonPerHour: 10,
  /** per-schedule grace a new khatma starts with (spec 3.1) */
  graceDefaults: DEFAULT_GRACE,
  /** share of the grace, in waking time, still left at the "almost up" note */
  graceNoticeFraction: 0.25,
  quietStartHour: 22,
  quietEndHour: 7,
  defaultPaceMs: 3 * DAY,
  paceMinMs: DAY,
  paceMaxMs: 7 * DAY,
  /** finishes faster than this say nothing about a person's pace */
  paceMinCountedMs: 20 * MINUTE,
  paceSampleSize: 5,
  paceMinFinishes: 3,
  reminderPaceMultiple: 1.5,
  /** one nudge (reminder or behind invite) per member per this window */
  nudgeCooldownMs: DAY,
  openForHelpBatchMs: HOUR,
  organizerInactiveMs: 30 * DAY,
  successorActiveMs: 7 * DAY,
  /** how long a cleared note is kept after it was cleared */
  notesRetentionMs: 30 * DAY,
  /** safety cap: an uncleared note this old is deleted anyway */
  notesUnclearedCapMs: 180 * DAY,
  handoffTtlMs: 30 * MINUTE,
  previewPerIpPerMinute: 30,
  handoffRedeemGlobalPerMinute: 60,
  maintenanceMode: false,
  announcement: null as string | null,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** Widen literal defaults (`60`, `false`) to their primitive type (`number`, `boolean`). */
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];

/**
 * Read a setting, falling back to its default when no row exists. The stored
 * value is trusted to have the default's type (the admin panel validates writes).
 */
export async function getSetting<K extends SettingKey>(
  ctx: QueryCtx,
  key: K,
): Promise<SettingValue<K>> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return row === null ? SETTING_DEFAULTS[key] : (row.value as SettingValue<K>);
}

/** The quiet window (no push inside it) as `QuietHours`. */
export async function quietHours(ctx: QueryCtx): Promise<QuietHours> {
  return {
    startHour: await getSetting(ctx, "quietStartHour"),
    endHour: await getSetting(ctx, "quietEndHour"),
  };
}
