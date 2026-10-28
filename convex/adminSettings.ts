import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/adminSession";
import { writeAudit } from "./lib/audit";
import { getSetting, SETTING_DEFAULTS, type SettingKey } from "./lib/settings";
import {
  cleanValue,
  crossCheck,
  SETTING_SPECS,
  validateSetting,
  type CrossCheckValues,
} from "./lib/settingSpecs";

const MAX_NOTE = 500;

function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key);
}

function settingRow(ctx: MutationCtx, key: SettingKey) {
  return ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

/** The cross-checked settings as they'd be after `key` becomes `value`. */
async function crossCheckWith(
  ctx: MutationCtx,
  key: SettingKey,
  value: unknown,
): Promise<"pace_order" | "quiet_hours_equal" | null> {
  const keys = [
    "defaultPaceMs",
    "paceMinMs",
    "paceMaxMs",
    "quietStartHour",
    "quietEndHour",
  ] as const;
  const next = {} as CrossCheckValues;
  for (const k of keys) {
    next[k] = k === key ? (value as number) : await getSetting(ctx, k);
  }
  return crossCheck(next);
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim().slice(0, MAX_NOTE);
  return trimmed ? trimmed : undefined;
}

export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("settings").collect();
    const stored = new Map(rows.map((r) => [r.key, r.value] as const));
    return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => ({
      key,
      value: stored.has(key) ? stored.get(key) : SETTING_DEFAULTS[key],
      defaultValue: SETTING_DEFAULTS[key] as unknown,
      isDefault: !stored.has(key),
      spec: SETTING_SPECS[key],
    }));
  },
});

/** Stores a validated value. Nothing is written, audit included, when it's refused. */
export const set = adminMutation({
  args: { key: v.string(), value: v.any(), note: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true } | { error: string }> => {
    if (!isSettingKey(args.key)) return { error: "unknown_key" };
    const key = args.key;
    const value = cleanValue(key, args.value);
    const invalid = validateSetting(key, value);
    if (invalid) return { error: invalid };
    const crossed = await crossCheckWith(ctx, key, value);
    if (crossed) return { error: crossed };

    const before = await getSetting(ctx, key);
    const row = await settingRow(ctx, key);
    if (row) {
      await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", { key, value, updatedAt: Date.now() });
    }
    await writeAudit(ctx, {
      adminId: ctx.admin._id,
      action: "setting.set",
      targetKind: "setting",
      targetId: key,
      before,
      after: value,
      note: cleanNote(args.note),
    });
    return { ok: true };
  },
});

/** Goes back to the default in code, if the default fits the other settings. */
export const reset = adminMutation({
  args: { key: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ ok: true } | { error: string }> => {
    if (!isSettingKey(args.key)) return { error: "unknown_key" };
    const key = args.key;
    const crossed = await crossCheckWith(ctx, key, SETTING_DEFAULTS[key]);
    if (crossed) return { error: crossed };
    const row = await settingRow(ctx, key);
    if (!row) return { ok: true };
    await ctx.db.delete(row._id);
    await writeAudit(ctx, {
      adminId: ctx.admin._id,
      action: "setting.reset",
      targetKind: "setting",
      targetId: key,
      before: row.value,
      after: SETTING_DEFAULTS[key],
      note: cleanNote(args.note),
    });
    return { ok: true };
  },
});
