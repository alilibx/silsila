/** Where the gate remembers which required version it already reloaded for. */
const RELOADED_FOR = "wirdak.reloadedFor";

type Storage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

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
 * version and the page is still old (a stale cache), stop and ask.
 */
export function versionGate(
  current: string,
  required: string | null,
  storage: Storage,
): "ok" | "reload" | "stuck" {
  if (required === null || !isOlder(current, required)) return "ok";
  if (storage.get(RELOADED_FOR) === required) return "stuck";
  storage.set(RELOADED_FOR, required);
  return "reload";
}
