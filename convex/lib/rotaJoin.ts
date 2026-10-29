import { randomCode } from "./crypto";

/** A rota khatma's join code is this many symbols of `CODE_ALPHABET`. */
export const JOIN_CODE_LENGTH = 6;

/**
 * A fresh join code, the one a member sends on WhatsApp to ask to join. Short
 * enough to type, so callers check `by_joinCode` for a collision.
 */
export function randomJoinCode(): string {
  return randomCode(JOIN_CODE_LENGTH);
}
