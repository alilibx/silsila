import { useSyncExternalStore } from "react";
import { readStored, removeStored, writeStored } from "../../lib/session";

/** A signed-out visitor's key to their help requests (plan 3 spec 3.5). */
const KEY = "wirdak.help.reporter";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReporterToken(): string | null {
  return readStored(KEY);
}

/** The token, re-rendering when a first request creates it or a sign-in forgets it. */
export function useReporterToken(): string | null {
  return useSyncExternalStore(subscribe, getReporterToken, () => null);
}

/** The token, created on first use: 32 random bytes as hex. */
export function ensureReporterToken(): string {
  const existing = getReporterToken();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  writeStored(KEY, token);
  notify();
  return token;
}

/** After the requests moved to an account, the browser no longer needs the token. */
export function forgetReporterToken(): void {
  removeStored(KEY);
  notify();
}
