import { useSyncExternalStore } from "react";

const SESSION_KEY = "wirdak.session";
const CLIENT_KEY = "wirdak.client";

// localStorage can throw (blocked or full storage). Writes then land in memory, and reads
// check both, so a value written in this tab is always readable in this tab.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

function remove(key: string): void {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing else to clear
  }
}

// The `storage` event only fires in other tabs, so same-tab changes notify through this set.
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SESSION_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSessionToken(): string | null {
  return read(SESSION_KEY);
}

export function setSessionToken(token: string): void {
  write(SESSION_KEY, token);
  notify();
}

export function clearSessionToken(): void {
  remove(SESSION_KEY);
  notify();
}

/** The session token, or `undefined` when signed out. Reacts to same-tab and cross-tab changes. */
export function useSessionToken(): string | undefined {
  return useSyncExternalStore(subscribeSession, getSessionToken) ?? undefined;
}

/** A random per-browser key (128 bits, hex), created once and then reused. */
export function getClientKey(): string {
  const existing = read(CLIENT_KEY);
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  write(CLIENT_KEY, key);
  return key;
}
