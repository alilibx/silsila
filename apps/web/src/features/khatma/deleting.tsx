import { useSyncExternalStore } from "react";
import { t } from "../../i18n/ar";
import { thrownMessage } from "../rota/errors";

/**
 * A deleted khatma's pages go dead the moment the delete lands: its queries turn `null`, which
 * sends the page to the khatma's own link or to "not found". So from the tap until the move home,
 * every page of that khatma shows `DeletingPage` instead. The state lives here, outside any page:
 * the page that started the delete is replaced by that very state.
 */
let deletingCode: string | null = null;
let failure: { code: string; message: string } | null = null;
let clearTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** How long the pages keep the state after the move home: the router may commit the move late. */
const LINGER_MS = 3_000;

const errors: Record<string, string> = t.rota.errors;

/** Whether this khatma is being deleted: its pages show `DeletingPage`. */
export function useDeleting(inviteCode: string): boolean {
  return useSyncExternalStore(subscribe, () => deletingCode) === inviteCode;
}

/** Why the last delete of this khatma failed, or null. */
export function useDeleteFailure(inviteCode: string): string | null {
  const current = useSyncExternalStore(subscribe, () => failure);
  return current?.code === inviteCode ? current.message : null;
}

export function dismissDeleteFailure() {
  if (failure === null) return;
  failure = null;
  emit();
}

/**
 * Deletes the khatma and, once it is gone, runs `onDone` (the move home). `call` answers `{ ok }`
 * or `{ error }`. A refusal or a failure ends the state and is kept for `useDeleteFailure`.
 * Resolves to whether the khatma was deleted.
 */
export async function startDelete(
  inviteCode: string,
  call: () => Promise<{ ok: true } | { error: string }>,
  onDone: () => void,
): Promise<boolean> {
  if (deletingCode !== null) return false;
  clearTimeout(clearTimer);
  deletingCode = inviteCode;
  failure = null;
  emit();
  let message: string | null = null;
  try {
    const result = await call();
    if ("error" in result) message = errors[result.error] ?? t.errors.generic;
  } catch (caught) {
    message = thrownMessage(caught, errors);
  }
  if (message !== null) {
    deletingCode = null;
    failure = { code: inviteCode, message };
    emit();
    return false;
  }
  onDone();
  clearTimer = setTimeout(() => {
    deletingCode = null;
    emit();
  }, LINGER_MS);
  return true;
}

/** Forgets any delete in flight. For tests, which share this module between cases. */
export function resetDeleting() {
  clearTimeout(clearTimer);
  deletingCode = null;
  failure = null;
  emit();
}

/** What a khatma's pages show from the tap on «احذف الختمة» until the move home. */
export function DeletingPage() {
  return (
    <main aria-busy="true" className="mx-auto max-w-xl p-5">
      <p className="py-16 text-center text-xl text-ink-soft">
        {t.archive.deleting}
      </p>
    </main>
  );
}
