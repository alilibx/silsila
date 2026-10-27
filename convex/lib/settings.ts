import type { QueryCtx } from "../_generated/server";

export const SETTING_DEFAULTS = {
  maxMembers: 60,
  rotationLookbackRounds: 3,
  undoWindowMs: 10_000,
  completionDelayMs: 10_000,
  verificationTtlMs: 600_000,
  pinMaxAttempts: 5,
  verifyStartPerClientPer10Min: 5,
  verifyPerPhonePerHour: 10,
  verifyGlobalPerMinute: 120,
  /** take, finish, undo, release combined */
  poolActionsPerPersonPerMinute: 10,
  createsPerPersonPerDay: 5,
  newMembersPerKhatmaPerHour: 30,
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
