const KEY = "silsila.verify";

/** What a reloaded tab needs to pick the verification back up. Never holds a PIN or session. */
export type Progress = {
  verificationId: string;
  secret: string;
  displayName: string;
  expiresAt: number;
  /** The prefilled wa.me link (it carries the one-time code only), so a reload can reopen WhatsApp. */
  waUrl?: string;
};

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Blocked or full storage: the flow still works, it just can't survive a reload.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing else to clear
  }
}

/** Saved progress that is well-formed and unexpired; anything else is cleared and ignored. */
export function loadProgress(): Progress | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw) as Partial<Progress> | null;
    if (
      p !== null &&
      typeof p === "object" &&
      typeof p.verificationId === "string" &&
      typeof p.secret === "string" &&
      typeof p.displayName === "string" &&
      typeof p.expiresAt === "number" &&
      p.expiresAt > Date.now()
    ) {
      return {
        verificationId: p.verificationId,
        secret: p.secret,
        displayName: p.displayName,
        expiresAt: p.expiresAt,
        ...(typeof p.waUrl === "string" ? { waUrl: p.waUrl } : {}),
      };
    }
  } catch {
    // fall through to clearing
  }
  clearProgress();
  return null;
}
