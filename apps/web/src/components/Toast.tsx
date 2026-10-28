import { useEffect, useState } from "react";
import { t } from "../i18n/ar";

export const UNDO_WINDOW_MS = 10_000;
const MESSAGE_MS = 6_000;
const LINGER_MS = 3_000;

export type ToastData = {
  /** A new id replaces the toast on screen and restarts its timers. */
  id: number;
  text: string;
  /** Present for the finish toast: how long the undo button stays, in ms (0 < n <= 10 000). */
  undoMs?: number;
};

type Props = {
  toast: ToastData;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
};

/**
 * One toast at a time, shown inside the page's always-mounted live region. A finish toast
 * offers an undo button with a bar that drains over `undoMs`; at zero the button goes away
 * and the message lingers a moment longer. Mount it with `key={toast.id}` so a new toast
 * starts clean.
 */
export function Toast({ toast, busy, onUndo, onDismiss }: Props) {
  const remaining = toast.undoMs ?? null;
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (remaining === null) {
      timers.push(setTimeout(onDismiss, MESSAGE_MS));
    } else {
      timers.push(setTimeout(() => setExpired(true), remaining));
      timers.push(setTimeout(onDismiss, remaining + LINGER_MS));
    }
    return () => timers.forEach(clearTimeout);
    // Timers start once per toast; the parent remounts this component for a new one.
  }, []);

  const canUndo = remaining !== null && !expired;

  return (
    <div className="fixed inset-x-4 bottom-5 z-30 mx-auto flex max-w-xl animate-sheet-up items-center justify-between gap-3 overflow-hidden rounded-[18px] bg-green-deep px-4 py-3.5 text-[#F7F1E3] shadow-[0_12px_30px_rgba(0,0,0,0.3)]">
      <span className="py-1.5 text-lg font-medium">{toast.text}</span>
      {canUndo && (
        <>
          <button
            type="button"
            onClick={onUndo}
            disabled={busy}
            className="min-h-14 shrink-0 rounded-xl bg-white/15 px-5 font-semibold text-white disabled:opacity-50"
          >
            {t.toast.undo}
          </button>
          <span
            data-testid="undo-bar"
            aria-hidden="true"
            className="animate-toast-shrink absolute start-0 bottom-0 h-1 bg-gold"
            style={{ animationDuration: `${remaining}ms` }}
          />
        </>
      )}
    </div>
  );
}
