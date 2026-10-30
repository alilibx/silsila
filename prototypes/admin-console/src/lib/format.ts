import type { GraceMap, SettingSpec, SettingValue } from "./types";

const DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function ar(value: number | string): string {
  return String(value).replace(/\d/g, (d) => DIGITS[Number(d)]);
}

const numberFormat = new Intl.NumberFormat("ar-u-nu-arab");
export function num(value: number): string {
  return numberFormat.format(value);
}

const dateFormat = new Intl.DateTimeFormat("ar-u-nu-arab-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormat = new Intl.DateTimeFormat("ar-u-nu-arab-ca-gregory", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function date(ms: number | null): string {
  return ms === null ? "—" : dateFormat.format(ms);
}

export function dateTime(ms: number | null): string {
  return ms === null ? "—" : dateTimeFormat.format(ms);
}

const relative = new Intl.RelativeTimeFormat("ar-u-nu-arab", { numeric: "auto" });

export function ago(ms: number | null): string {
  if (ms === null) return "لم يدخل بعد";
  const minutes = Math.round((ms - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return "الآن";
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)} ••• ${phone.slice(-3)}`;
}

export function initials(name: string): string {
  return name.trim().slice(0, 1);
}

function counted(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${num(n)} ${n <= 10 ? few : many}`;
}

const AMOUNTS = {
  days: (n: number) => counted(n, "يوم", "يومان", "أيام", "يوماً"),
  hours: (n: number) => counted(n, "ساعة", "ساعتان", "ساعات", "ساعة"),
  minutes: (n: number) => counted(n, "دقيقة", "دقيقتان", "دقائق", "دقيقة"),
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function durationText(ms: number): string {
  if (ms === 0) return ar(0);
  if (ms % DAY === 0) return AMOUNTS.days(ms / DAY);
  if (ms % HOUR === 0) return AMOUNTS.hours(ms / HOUR);
  if (ms % MINUTE === 0) return AMOUNTS.minutes(ms / MINUTE);
  return `${ar(Math.round(ms / 1000))} ثانية`;
}

export function timeText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${ar(`${hour12}:${String(minutes % 60).padStart(2, "0")}`)} ${h < 12 ? "ص" : "م"}`;
}

export function settingText(spec: SettingSpec, value: SettingValue): string {
  switch (spec.kind) {
    case "duration":
      return durationText(value as number);
    case "hour":
      return ar(`${String(value).padStart(2, "0")}:00`);
    case "time":
      return timeText(value as number);
    case "bool":
      return value ? "مفعّل" : "متوقف";
    case "text":
    case "version":
      return typeof value === "string" && value !== "" ? value : "—";
    case "int":
    case "number":
      return ar(String(value).replace(".", "٫"));
    case "grace":
      return Object.values(value as GraceMap)
        .map((g) => AMOUNTS[g.unit](g.value))
        .join("، ");
  }
}
