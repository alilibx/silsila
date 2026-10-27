import { parsePhoneNumberFromString } from "libphonenumber-js/min";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const DISPLAY_NAME_MAX = 40;

/** Replaces ASCII digits with Eastern Arabic digits (١٢٣). */
export function toArabicDigits(v: number | string): string {
  return String(v).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)] ?? d);
}

/** Maps Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (c) => {
    const code = c.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Trims, collapses whitespace, and strips control and bidi-override characters.
 * Returns `null` when nothing is left; otherwise at most 40 characters.
 */
export function cleanDisplayName(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/gu, " ")
    .replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned === "") return null;
  return Array.from(cleaned).slice(0, DISPLAY_NAME_MAX).join("").trim();
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
