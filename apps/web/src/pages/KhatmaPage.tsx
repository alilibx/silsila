import { api } from "@convex/_generated/api";
import type { KhatmaView } from "@convex/khatmas";
import { toArabicDigits } from "@convex/lib/digits";
import { JUZ } from "@convex/lib/juz";
import type {
  FinishResult,
  ReleaseResult,
  TakeResult,
  UndoResult,
} from "@convex/pool";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { MainCard } from "../components/MainCard";
import { PoolGrid } from "../components/PoolGrid";
import { Ring } from "../components/Ring";
import { Sheet } from "../components/Sheet";
import { Toast, type ToastData } from "../components/Toast";
import { VerifySheet } from "../features/verify/VerifySheet";
import { t } from "../i18n/ar";
import { formatDate } from "../lib/format";
import {
  clearSessionToken,
  getSessionToken,
  useSessionToken,
} from "../lib/session";
import { CelebrationPage } from "./CelebrationPage";
import { NotFoundPage } from "./NotFoundPage";

const chip =
  "rounded-full border border-line bg-paper-2 px-3 py-1 text-base text-ink-soft";

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

type OpenSheet = { kind: "take"; juz: number } | { kind: "release" } | null;

function khatmaTitle(view: KhatmaView): string {
  return view.name ?? t.khatma.untitled(formatDate(view.createdAt));
}

export function KhatmaPage() {
  const { inviteCode = "" } = useParams();
  const [search] = useSearchParams();
  const from = search.get("from");
  const sessionToken = useSessionToken();
  // The juz' a signed-out visitor tapped; it also means the verify sheet is open.
  const [pendingJuz, setPendingJuz] = useState<number | null>(null);
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
  const view = useQuery(api.khatmas.view, {
    sessionToken,
    inviteCode,
    ...(from ? { from } : {}),
  });

  // The server decides who is signed in; a stored token alone proves nothing.
  const signedIn =
    view !== undefined && !("notFound" in view) && view.me.signedIn;
  const tokenIsDead =
    sessionToken !== undefined &&
    view !== undefined &&
    !("notFound" in view) &&
    !view.me.signedIn;

  // A revoked or expired token is dead, and nothing else clears it. `view` is only defined
  // once Convex has answered for the current args (it is undefined while they change), and
  // the storage check skips a token that was replaced between render and effect.
  useEffect(() => {
    if (tokenIsDead && getSessionToken() === sessionToken) clearSessionToken();
  }, [tokenIsDead, sessionToken]);

  const loaded = view !== undefined && !("notFound" in view) ? view : null;

  // After verification the view reloads under the new token. Wait for it, and never offer a
  // second juz' to someone who already holds one.
  useEffect(() => {
    if (verifiedJuz === null || !loaded?.me.signedIn) return;
    setVerifiedJuz(null);
    if (loaded.me.holding !== null) return;
    const wanted = loaded.tiles.find((x) => x.juz === verifiedJuz);
    const juz = wanted?.state === "open" ? verifiedJuz : loaded.me.suggestion;
    if (juz !== null) setSheet({ kind: "take", juz });
  }, [verifiedJuz, loaded]);

  // After losing a race, offer the new suggestion. While the view still suggests the juz' we
  // lost, it has not caught up yet, so keep waiting.
  useEffect(() => {
    if (lostJuz === null || !loaded) return;
    const { holding, suggestion } = loaded.me;
    if (holding !== null || suggestion === null) return setLostJuz(null);
    if (suggestion === lostJuz) return;
    setLostJuz(null);
    setSheet({ kind: "take", juz: suggestion });
  }, [lostJuz, loaded]);

  const showToast = (text: string, undoUntil?: number) =>
    setToast({ id: ++toastId.current, text, undoUntil });

  /** One server call at a time. A thrown call is a network failure: toast it and let the user retry. */
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await work();
    } catch {
      showToast(errors.network);
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
  const verified = () => {
    const juz = pendingJuz;
    setPendingJuz(null);
    if (juz !== null) setVerifiedJuz(juz);
  };

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
    if (result.ok) showToast(t.toast.finished, result.undoUntil);
    else showToast(finishCopy[result.reason]);
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
    if (result && !result.ok) showToast(errors.generic);
  }

  const celebrating = loaded !== null && loaded.me.celebrateRound !== null;

  // The sheet sits outside the page body so it survives the reload the new session token triggers.
  return (
    <>
      {view === undefined ? (
        <main className="mx-auto max-w-xl p-5">
          <p role="status" className="py-16 text-center text-xl text-ink-soft">
            {t.common.loading}
          </p>
        </main>
      ) : "notFound" in view ? (
        <NotFoundPage />
      ) : view.me.celebrateRound !== null ? (
        <CelebrationPage
          title={khatmaTitle(view)}
          round={view.me.celebrateRound}
          participants={view.lastCompleted?.participants ?? null}
          tiles={view.tiles}
          busy={busy}
          onContinue={() => void continueToKhatma()}
        />
      ) : (
        <KhatmaContent
          view={view}
          busy={busy}
          onTake={take}
          onFinish={() => void finish()}
          onRelease={() => setSheet({ kind: "release" })}
        />
      )}
      {loaded && !celebrating && sheet?.kind === "take" && (
        <TakeSheet
          juz={sheet.juz}
          busy={busy}
          onConfirm={() => void confirmTake(sheet.juz)}
          onClose={() => setSheet(null)}
        />
      )}
      {loaded && !celebrating && sheet?.kind === "release" && (
        <ReleaseSheet
          juz={loaded.me.holding}
          busy={busy}
          onConfirm={() => void confirmRelease()}
          onClose={() => setSheet(null)}
        />
      )}
      {pendingJuz !== null && (
        <VerifySheet
          title={t.verify.beforeTake}
          onVerified={verified}
          onClose={() => setPendingJuz(null)}
        />
      )}
      {toast && (
        <Toast
          key={toast.id}
          toast={toast}
          busy={busy}
          onUndo={() => void undo()}
          onDismiss={() => setToast(null)}
        />
      )}
    </>
  );
}

function TakeSheet({
  juz,
  busy,
  onConfirm,
  onClose,
}: {
  juz: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const info = JUZ.find((j) => j.number === juz);
  const number = toArabicDigits(juz);
  return (
    <Sheet title={t.tile.juz(number)} onClose={onClose}>
      <div className="py-2.5 text-center">
        <div className="text-[4.2rem] leading-none font-bold text-green-deep">
          {number}
        </div>
        {info && (
          <>
            <div className="mt-1 font-display text-[2.4rem]">{info.name}</div>
            <div className="mt-1 text-base text-ink-soft">
              {t.card.startsFrom(info.startSurah)}
            </div>
          </>
        )}
      </div>
      <div className="mt-5 grid gap-3">
        <Button onClick={onConfirm} disabled={busy}>
          {t.take.confirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.take.notNow}
        </Button>
      </div>
    </Sheet>
  );
}

function ReleaseSheet({
  juz,
  busy,
  onConfirm,
  onClose,
}: {
  juz: number | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={t.release.title} onClose={onClose}>
      {juz !== null && (
        <p className="leading-relaxed text-ink-soft">
          {t.release.body(toArabicDigits(juz))}
        </p>
      )}
      <div className="mt-5 grid gap-3">
        <Button onClick={onConfirm} disabled={busy}>
          {t.release.confirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.release.keep}
        </Button>
      </div>
    </Sheet>
  );
}

function KhatmaContent({
  view,
  busy,
  onTake,
  onFinish,
  onRelease,
}: {
  view: KhatmaView;
  busy: boolean;
  onTake: (juz: number) => void;
  onFinish: () => void;
  onRelease: () => void;
}) {
  const title = khatmaTitle(view);

  return (
    <main className="mx-auto max-w-xl p-5">
      <header className="mb-3.5">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-display text-2xl text-green"
        >
          {t.app.name}
        </Link>
      </header>

      {!view.me.isMember && (
        <p
          role="note"
          className="mb-3.5 rounded-ui border border-[#BFE0CB] bg-[#E7F5EC] p-3 text-ink"
        >
          {view.inviterName
            ? t.khatma.invited(view.inviterName)
            : t.khatma.invitedAnon}
          {!view.me.signedIn && ` ${t.khatma.verifyHint}`}
        </p>
      )}

      <h1 className="font-display text-4xl leading-tight text-green-deep">
        {title}
      </h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <span className={chip}>
          {t.khatma.round(toArabicDigits(view.roundNumber))}
        </span>
        <span className={chip}>{t.schedules[view.schedule]}</span>
        {view.targetEndAt !== null && (
          <span className={chip}>
            {t.khatma.target(formatDate(view.targetEndAt))}
          </span>
        )}
      </div>

      <Ring tiles={view.tiles} />
      <MainCard
        view={view}
        onTake={onTake}
        onFinish={onFinish}
        onRelease={onRelease}
        busy={busy}
      />
      <PoolGrid tiles={view.tiles} onTake={onTake} />

      {view.completedRounds > 0 && (
        <p className="mt-5 text-center text-ink-soft">
          {t.khatma.groupTotal(toArabicDigits(view.completedRounds))}
        </p>
      )}
    </main>
  );
}
