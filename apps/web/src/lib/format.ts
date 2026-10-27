import { t } from "../i18n/ar";

const dateFormat = new Intl.DateTimeFormat("ar", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatDate(ms: number): string {
  return dateFormat.format(ms);
}

// Order matters: iPhone/iPad UAs say "like Mac OS X", and Android UAs say "Linux".
const DEVICES: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux|X11/, "Linux"],
];

// Order matters: Edge and Samsung UAs also say "Chrome", and Chrome UAs also say "Safari".
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

function firstMatch(
  table: ReadonlyArray<readonly [RegExp, string]>,
  ua: string,
): string | undefined {
  return table.find(([pattern]) => pattern.test(ua))?.[1];
}

/** A short, human label for a user agent, e.g. "iPhone · Safari". */
export function deviceLabel(ua: string): string {
  const device = firstMatch(DEVICES, ua) ?? t.device.unknownDevice;
  const browser = firstMatch(BROWSERS, ua) ?? t.device.unknownBrowser;
  return `${device} · ${browser}`;
}
