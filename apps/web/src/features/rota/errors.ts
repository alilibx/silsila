import { t } from "../../i18n/ar";
import { errorCode } from "../../lib/errors";

const rotaErrors: Record<string, string> = t.rota.errors;

/** The words for a thrown failure: a coded one by its message, anything else as a network failure. */
export function thrownMessage(
  caught: unknown,
  messages: Record<string, string> = rotaErrors,
): string {
  const code = errorCode(caught);
  if (code === null) return t.errors.network;
  return messages[code] ?? rotaErrors[code] ?? t.errors.generic;
}
