import { CODE_ALPHABET, randomCode } from "./crypto";
import { normalizeDigits } from "./digits";

/** A rota khatma's join code is this many symbols of `CODE_ALPHABET`. */
export const JOIN_CODE_LENGTH = 6;

/**
 * A fresh join code, the one a member sends on WhatsApp to ask to join. Short
 * enough to type, so callers check `by_joinCode` for a collision.
 */
export function randomJoinCode(): string {
  return randomCode(JOIN_CODE_LENGTH);
}

const JOIN_WORD = "انضمام";
const DIACRITICS_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;

/** The message a member sends to ask to join: the title, then the code. */
export function joinText(title: string, code: string): string {
  return `${JOIN_WORD} إلى ${title} · ${code}`;
}

/**
 * The join code in an incoming message, or null. The text must hold «انضمام»
 * and a 6-symbol token of the code alphabet (case and digit script ignored).
 * The last such token wins: `joinText` ends with the code, and a Latin title
 * can look like one.
 */
export function findJoinCode(text: string): string | null {
  const plain = normalizeDigits(text).replace(DIACRITICS_AND_TATWEEL, "");
  if (!plain.includes(JOIN_WORD)) return null;
  const tokens = plain.toUpperCase().split(/[^A-Z0-9]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (
      token.length === JOIN_CODE_LENGTH &&
      [...token].every((ch) => CODE_ALPHABET.includes(ch))
    ) {
      return token;
    }
  }
  return null;
}

/** A wa.me link that opens a chat with the join message already typed. */
export function joinLink(
  publicNumber: string,
  title: string,
  code: string,
): string {
  const digits = publicNumber.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(joinText(title, code))}`;
}
