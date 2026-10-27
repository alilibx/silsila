import { api } from "@convex/_generated/api";
import type { KhatmaView } from "@convex/khatmas";
import { toArabicDigits } from "@convex/lib/digits";
import type {
  FinishResult,
  ReleaseResult,
  TakeResult,
  UndoResult,
} from "@convex/pool";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { UNDO_WINDOW_MS, type ToastData } from "../../components/Toast";
import { pendingIntent } from "../verify/progress";
import { t } from "../../i18n/ar";
import { useSessionToken } from "../../lib/session";

type Failure<R> = R extends { ok: false; reason: infer Reason }
  ? Reason
  : never;

const errors = t.actions.errors;
// Typed against the server's unions: a new failure reason is a compile error until it has copy.
const takeCopy: Record<Failure<TakeResult>, string> = {
  ...errors.shared,
  ...errors.take,
};
const finishCopy: Record<Failure<FinishResult>, string> = {
  ...errors.shared,
  not_holding: errors.notHolding,
};
const releaseCopy: Record<Failure<ReleaseResult>, string> = finishCopy;
const undoCopy: Record<Failure<UndoResult>, string> = {
  ...errors.shared,
  ...errors.undo,
};

/** The juz' of a verification still in flight for this khatma (e.g. the tab reloaded while in WhatsApp). */
function resumedJuz(inviteCode: string): number | null {
  const intent = pendingIntent();
  return intent?.kind === "take" && intent.inviteCode === inviteCode
    ? intent.juz
    : null;
}

/** How long after losing a race we wait for the view to offer another juz'. */
const LOST_WAIT_MS = 5_000;

export type OpenSheet =
  { kind: "take"; juz: number } | { kind: "release" } | null;

/**
 * How long the undo button stays, from the moment the finish result arrives. The server's
 * deadline is trusted only when it lands inside the 10-second window; if the client clock is
 * off it cannot be, so the full window starts at receipt instead.
 */
export function undoWindowMs(undoUntil: number, now: number): number {
  const remaining = undoUntil - now;
  return remaining > 0 && remaining <= UNDO_WINDOW_MS
    ? remaining
    : UNDO_WINDOW_MS;
}

/**
 * Everything the khatma page does besides drawing: the take, finish, undo, release and
 * celebrated mutations behind one busy lock, the sheet and toast state, and the two flows that
 * wait for the view (take after verification, take again after losing a race).
 */
export function useKhatmaActions(
  view: KhatmaView | { notFound: true } | undefined,
  inviteCode: string,
) {
  const sessionToken = useSessionToken();
  const loaded = view !== undefined && !("notFound" in view) ? view : null;
  const signedIn = loaded?.me.signedIn ?? false;
  const celebrating = loaded !== null && loaded.me.celebrateRound !== null;

  // The juz' a signed-out visitor tapped; it also means the verify sheet is open. A verification
  // already in flight for this khatma reopens the sheet, so a reloaded tab carries on.
  const [pendingJuz, setPendingJuz] = useState<number | null>(() =>
    resumedJuz(inviteCode),
  );
  // The juz' to offer once the view has reloaded for the new session.
  const [verifiedJuz, setVerifiedJuz] = useState<number | null>(null);
  // The juz' someone else just took; we reopen the sheet when the view offers another.
  const [lostJuz, setLostJuz] = useState<number | null>(null);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const toastId = useRef(0);
  const takeMutation = useMutation(api.pool.take);
  const finishMutation = useMutation(api.pool.finish);
  const undoMutation = useMutation(api.pool.undoFinish);
  const releaseMutation = useMutation(api.pool.release);
  const celebratedMutation = useMutation(api.khatmas.markCelebrated);

  // After verification the view reloads under the new token. Wait for it, and never offer a
  // second juz' to someone who already holds one.
  useEffect(() => {
    if (verifiedJuz === null || !loaded?.me.signedIn || celebrating) return;
    setVerifiedJuz(null);
    if (loaded.me.holding !== null) return;
    const wanted = loaded.tiles.find((x) => x.juz === verifiedJuz);
    const juz = wanted?.state === "open" ? verifiedJuz : loaded.me.suggestion;
    if (juz !== null) setSheet({ kind: "take", juz });
  }, [verifiedJuz, loaded, celebrating]);

  // After losing a race, offer the new suggestion. While the view still suggests the juz' we
  // lost, it has not caught up yet, so keep waiting (see the timeout below).
  useEffect(() => {
    if (lostJuz === null || !loaded || celebrating) return;
    const { holding, suggestion } = loaded.me;
    if (holding !== null || suggestion === null) return setLostJuz(null);
    if (suggestion === lostJuz) return;
    setLostJuz(null);
    setSheet({ kind: "take", juz: suggestion });
  }, [lostJuz, loaded, celebrating]);

  // The wait is bounded, so a much later, unrelated change of suggestion cannot pop a sheet open.
  useEffect(() => {
    if (lostJuz === null) return;
    const timer = setTimeout(() => setLostJuz(null), LOST_WAIT_MS);
    return () => clearTimeout(timer);
  }, [lostJuz]);

  // The celebration takes over the screen, and nothing may wait behind it.
  useEffect(() => {
    if (!celebrating) return;
    setSheet(null);
    setLostJuz(null);
    setVerifiedJuz(null);
  }, [celebrating]);

  // A release confirmation for a juz' that is no longer held (released elsewhere, or finished
  // by someone's other device) has nothing left to confirm.
  const holdingNothing = loaded !== null && loaded.me.holding === null;
  useEffect(() => {
    if (holdingNothing && sheet?.kind === "release") setSheet(null);
  }, [holdingNothing, sheet]);

  const showToast = (text: string, undoMs?: number) =>
    setToast({ id: ++toastId.current, text, undoMs });

  /** One server call at a time. A thrown call is a network failure: toast it and let the user retry. */
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setLostJuz(null); // any user action ends the wait for a suggestion
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await work();
    } catch {
      showToast(t.errors.network);
      return undefined;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const args = { sessionToken, inviteCode };

  const take = (juz: number) => {
    if (!signedIn) return setPendingJuz(juz);
    setLostJuz(null);
    setSheet({ kind: "take", juz });
  };
  const openRelease = () => {
    setLostJuz(null);
    setSheet({ kind: "release" });
  };
  const closeSheet = () => {
    setLostJuz(null);
    setSheet(null);
  };
  const verified = () => {
    const juz = pendingJuz;
    setPendingJuz(null);
    if (juz !== null) setVerifiedJuz(juz);
  };
  const cancelVerify = () => setPendingJuz(null);

  async function confirmTake(juz: number) {
    const result = await run(() => takeMutation({ ...args, juz }));
    if (!result) return;
    setSheet(null);
    if (result.ok) return showToast(t.toast.taken(toArabicDigits(juz)));
    showToast(takeCopy[result.reason]);
    if (result.reason === "taken") setLostJuz(juz);
  }

  async function finish() {
    const result = await run(() => finishMutation(args));
    if (!result) return;
    if (result.ok) {
      showToast(t.toast.finished, undoWindowMs(result.undoUntil, Date.now()));
    } else {
      showToast(finishCopy[result.reason]);
    }
  }

  async function undo() {
    const result = await run(() => undoMutation(args));
    if (!result) return;
    showToast(result.ok ? t.toast.undone : undoCopy[result.reason]);
  }

  async function confirmRelease() {
    const result = await run(() => releaseMutation(args));
    if (!result) return;
    setSheet(null);
    showToast(result.ok ? t.toast.released : releaseCopy[result.reason]);
  }

  async function continueToKhatma() {
    const result = await run(() => celebratedMutation(args));
    // On success the view flips `celebrateRound` to null by itself.
    if (result && !result.ok) showToast(t.errors.generic);
  }

  return {
    busy,
    toast,
    dismissToast: () => setToast(null),
    // Never show a sheet over the celebration, even in the render before the effect clears it.
    sheet: celebrating ? null : sheet,
    closeSheet,
    openRelease,
    pendingJuz,
    verified,
    cancelVerify,
    take,
    confirmTake,
    finish,
    undo,
    confirmRelease,
    continueToKhatma,
  };
}
