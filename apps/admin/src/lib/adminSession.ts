import { readStored, removeStored, writeStored } from "@web/lib/session";
import { useSyncExternalStore } from "react";

/** Admin sessions are stored apart from the website's member session. */
const ADMIN_KEY = "wirdak.admin.session";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === ADMIN_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAdminToken(): string | null {
  return readStored(ADMIN_KEY);
}

export function setAdminToken(token: string): void {
  writeStored(ADMIN_KEY, token);
  notify();
}

export function clearAdminToken(): void {
  removeStored(ADMIN_KEY);
  notify();
}

/** The stored admin token, or null; re-renders when it changes in any tab. */
export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribe, getAdminToken, () => null);
}
