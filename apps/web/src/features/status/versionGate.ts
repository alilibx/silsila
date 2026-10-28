/** Where the gate remembers which required version it already reloaded for. */
const RELOADED_FOR = "wirdak.reloadedFor";

type GateStorage = {
  get(key: string): string | null;
  /** True only when the value will still be there after a reload. */
  set(key: string, value: string): boolean;
};

/**
 * localStorage, else sessionStorage, read back to be sure. The website's usual
 * fallback keeps values in memory, which a reload wipes; the gate can't use it.
 */
export const lastingStorage: GateStorage = {
  get(key) {
    for (const store of stores()) {
      try {
        const value = store.getItem(key);
        if (value !== null) return value;
      } catch {
        // try the next one
      }
    }
    return null;
  },
  set(key, value) {
    for (const store of stores()) {
      try {
        store.setItem(key, value);
        if (store.getItem(key) === value) return true;
      } catch {
        // try the next one
      }
    }
    return false;
  },
};

function stores(): Storage[] {
  const found: Storage[] = [];
  try {
    found.push(window.localStorage);
  } catch {
    // blocked
  }
  try {
    found.push(window.sessionStorage);
  } catch {
    // blocked
  }
  return found;
}

/** True when release `a` (`x.y.z`) is older than release `b`. */
export function isOlder(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * What to do about the admin's minimum version (spec 9.4): nothing, reload
 * once to pick up the new release, or, if a reload already happened for this
 * version and the page is still old (a stale cache), or the browser can't
 * remember that it reloaded, stop and ask.
 */
export function versionGate(
  current: string,
  required: string | null,
  storage: GateStorage,
): "ok" | "reload" | "stuck" {
  if (required === null || !isOlder(current, required)) return "ok";
  if (storage.get(RELOADED_FOR) === required) return "stuck";
  // Without a lasting marker every reload would decide to reload again.
  return storage.set(RELOADED_FOR, required) ? "reload" : "stuck";
}
