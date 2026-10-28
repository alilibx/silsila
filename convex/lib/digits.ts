const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

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
