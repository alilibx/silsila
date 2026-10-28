import { toArabicDigits } from "@convex/lib/digits";
import type { SettingSpec } from "@convex/lib/settingSpecs";
import { t as webT } from "@web/i18n/ar";
import { t } from "../i18n/ar";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A duration in the largest unit that divides it whole, in words. */
export function formatDuration(ms: number): string {
  if (ms === 0) return toArabicDigits(0);
  if (ms % DAY === 0) return webT.grace.amount.days(ms / DAY);
  if (ms % HOUR === 0) return webT.grace.amount.hours(ms / HOUR);
  if (ms % MINUTE === 0) return webT.grace.amount.minutes(ms / MINUTE);
  return t.settings.seconds(Math.round(ms / SECOND));
}

/** A setting's value as an admin reads it: "٣ أيام", "22:00", "مفعّل". */
export function formatSetting(spec: SettingSpec, value: unknown): string {
  switch (spec.kind) {
    case "duration":
      return typeof value === "number" ? formatDuration(value) : String(value);
    case "hour":
      return `${String(value).padStart(2, "0")}:00`;
    case "bool":
      return value ? t.settings.on : t.settings.off;
    case "text":
      return typeof value === "string" ? value : t.settings.empty;
    case "version":
      return typeof value === "string" ? value : t.settings.empty;
    case "int":
    case "number":
      return typeof value === "number"
        ? toArabicDigits(String(value).replace(".", "٫"))
        : String(value);
    case "grace":
      return typeof value === "object" && value !== null
        ? Object.values(
            value as Record<
              string,
              { value: number; unit: "minutes" | "hours" | "days" }
            >,
          )
            .map((g) => webT.grace.amount[g.unit](g.value))
            .join("، ")
        : String(value);
  }
}
