import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// Re-exported so existing Convex imports keep working; the web app imports ./digits directly.
export { normalizeDigits, toArabicDigits } from "./digits";

const DISPLAY_NAME_MAX = 40;
const KHATMA_NAME_MAX = 60;

// Invisible characters that render as blank but are not whitespace or \p{Cf}:
// Braille blank (U+2800), Hangul fillers (U+115F, U+1160, U+3164, U+FFA0).
const BLANK_FILLERS = "\u2800\u115F\u1160\u3164\uFFA0";
// ZWNJ and ZWJ are \p{Cf} but are meaningful in Persian, Arabic-script, and emoji text.
const CONTROL_OR_FORMAT = new RegExp(
  `[\\p{Cc}${BLANK_FILLERS}]|(?![\\u200C\\u200D])\\p{Cf}`,
  "gu",
);

/**
 * Trims, collapses whitespace, and strips control, format (bidi marks and
 * overrides, zero-width space, ...), and blank-filler characters, keeping ZWNJ
 * and ZWJ. Returns `null` unless a letter or digit remains; otherwise at most
 * 40 characters.
 */
export function cleanDisplayName(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/gu, " ") // tabs and newlines become spaces before controls are stripped
    .replace(CONTROL_OR_FORMAT, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
  return Array.from(cleaned).slice(0, DISPLAY_NAME_MAX).join("").trim();
}

/**
 * Trims, collapses whitespace, strips control, format, and blank-filler
 * characters (keeping ZWNJ and ZWJ), and caps the result at 60 characters.
 * Empty (or `null`) input gives `null`.
 */
export function cleanKhatmaName(raw: string | null): string | null {
  if (raw === null) return null;
  const cleaned = raw
    .replace(/\s+/gu, " ")
    .replace(CONTROL_OR_FORMAT, "")
    .replace(/\s+/gu, " ")
    .trim();
  const capped = Array.from(cleaned).slice(0, KHATMA_NAME_MAX).join("").trim();
  return capped === "" ? null : capped;
}

/** `+971501234567` becomes `+971 50 ••• 4567`. Unparseable input is masked to its last 4 digits. */
export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  if (parsed) {
    const national = parsed.nationalNumber;
    const last4 = national.slice(-4);
    if (national.length >= 7) {
      return `+${parsed.countryCallingCode} ${national.slice(0, 2)} ••• ${last4}`;
    }
    return `+${parsed.countryCallingCode} ••• ${last4}`;
  }
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 4 ? `••• ${digits.slice(-4)}` : "•••";
}
