import type { Doc } from "../_generated/dataModel";
import { CODE_ALPHABET, randomCode } from "./crypto";
import { normalizeDigits } from "./digits";
import { isArchived } from "./khatma";
import { khatmaTitle } from "./whatsappTemplates";

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
 * `joinText` puts the code right after the last «·», so that token is the
 * code, whatever follows it (a Latin title can look like a code, too). With no
 * «·», the last such token wins.
 */
export function findJoinCode(text: string): string | null {
  const plain = normalizeDigits(text).replace(DIACRITICS_AND_TATWEEL, "");
  if (!plain.includes(JOIN_WORD)) return null;
  const dot = plain.lastIndexOf("·");
  const tokens = (dot === -1 ? plain : plain.slice(dot + 1))
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token !== "");
  if (dot !== -1) return isJoinCode(tokens[0]) ? tokens[0]! : null;
  return tokens.findLast(isJoinCode) ?? null;
}

function isJoinCode(token: string | undefined): boolean {
  return (
    token !== undefined &&
    token.length === JOIN_CODE_LENGTH &&
    [...token].every((ch) => CODE_ALPHABET.includes(ch))
  );
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

/**
 * A rota khatma's join link, or null while it has no join code, the public
 * business number is not set (nothing to link to), or it is archived (nobody
 * can join an archived khatma).
 */
export function khatmaJoinLink(
  khatma: Doc<"khatmas">,
  publicNumber: string | undefined,
): string | null {
  if (isArchived(khatma)) return null;
  if (!publicNumber || khatma.joinCode === undefined) return null;
  return joinLink(publicNumber, khatmaTitle(khatma), khatma.joinCode);
}
