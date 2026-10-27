import { SCHEDULES, type Schedule } from "@convex/lib/schedule";

const KEY = "silsila.verify";
const JUZ_COUNT = 30;

/**
 * What the person was doing when they went to WhatsApp, so the page they come back to (even a
 * reloaded or discarded tab) can reopen the sheet and carry on.
 */
export type VerifyIntent =
  | { kind: "take"; inviteCode: string; juz: number }
  | { kind: "create"; name: string; schedule: Schedule }
  | { kind: "signin" };

/** What a reloaded tab needs to pick the verification back up. Never holds a PIN or session. */
export type Progress = {
  verificationId: string;
  secret: string;
  displayName: string;
  expiresAt: number;
  /** The prefilled wa.me link (it carries the one-time code only), so a reload can reopen WhatsApp. */
  waUrl?: string;
  intent?: VerifyIntent;
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

function isSchedule(value: unknown): value is Schedule {
  return SCHEDULES.some((s) => s === value);
}

/** A well-formed intent, or `undefined`. */
function parseIntent(raw: unknown): VerifyIntent | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const i = raw as Record<string, unknown>;
  if (i.kind === "signin") return { kind: "signin" };
  if (
    i.kind === "take" &&
    typeof i.inviteCode === "string" &&
    i.inviteCode !== "" &&
    typeof i.juz === "number" &&
    Number.isInteger(i.juz) &&
    i.juz >= 1 &&
    i.juz <= JUZ_COUNT
  ) {
    return { kind: "take", inviteCode: i.inviteCode, juz: i.juz };
  }
  if (
    i.kind === "create" &&
    typeof i.name === "string" &&
    isSchedule(i.schedule)
  ) {
    return { kind: "create", name: i.name, schedule: i.schedule };
  }
  return undefined;
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
      const intent = parseIntent(p.intent);
      return {
        verificationId: p.verificationId,
        secret: p.secret,
        displayName: p.displayName,
        expiresAt: p.expiresAt,
        ...(typeof p.waUrl === "string" ? { waUrl: p.waUrl } : {}),
        ...(intent ? { intent } : {}),
      };
    }
  } catch {
    // fall through to clearing
  }
  clearProgress();
  return null;
}

/** The intent of a verification still in flight in this browser, if any. */
export function pendingIntent(): VerifyIntent | null {
  return loadProgress()?.intent ?? null;
}
