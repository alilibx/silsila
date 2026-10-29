import { t } from "../i18n/ar";

/** The admin copy for an operation's error code. */
export function opsError(code: string): string {
  const known: Record<string, string> = t.ops.errors;
  return known[code] ?? t.ops.errors.generic;
}

/** The note only when there is one, so calls without a note send no key. */
export function withNote<T extends object>(args: T, note: string | undefined) {
  return note === undefined ? args : { ...args, note };
}
