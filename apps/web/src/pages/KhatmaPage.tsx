import { api } from "@convex/_generated/api";
import type { KhatmaView } from "@convex/khatmas";
import type { NoteView } from "@convex/notes";
import { toArabicDigits } from "@convex/lib/digits";
import { useQuery } from "convex/react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "../components/Button";
import { NoteCard, takeTarget } from "../components/NoteCard";
import { MainCard } from "../components/MainCard";
import { InstallStepsSheet } from "../components/InstallStepsSheet";
import { SwitchRow } from "../components/SwitchRow";
import { WhatsAppSheet } from "../components/WhatsAppSheet";
import { PoolGrid } from "../components/PoolGrid";
import { PushPromptSheet } from "../components/PushPromptSheet";
import { ReleaseSheet } from "../components/ReleaseSheet";
import { Ring } from "../components/Ring";
import { ShareSheets } from "../components/ShareSheets";
import { TakeSheet } from "../components/TakeSheet";
import { Toast } from "../components/Toast";
import { useKhatmaActions } from "../features/khatma/useKhatmaActions";
import { useShareSheet } from "../features/share/useShareSheet";
import { VerifySheet } from "../features/verify/VerifySheet";
import { t } from "../i18n/ar";
import { formatDate } from "../lib/format";
import { useSessionToken } from "../lib/session";
import { useClearDeadToken } from "../lib/useClearDeadToken";
import { CelebrationPage } from "./CelebrationPage";
import { NotFoundPage } from "./NotFoundPage";

const chip =
  "rounded-full border border-line bg-paper-2 px-3 py-1 text-base text-ink-soft";

function khatmaTitle(view: KhatmaView): string {
  return view.name ?? t.khatma.untitled(formatDate(view.createdAt));
}

export function KhatmaPage() {
  const { inviteCode = "" } = useParams();
  const [search] = useSearchParams();
  const from = search.get("from");
  const sessionToken = useSessionToken();
  const view = useQuery(api.khatmas.view, {
    sessionToken,
    inviteCode,
    ...(from ? { from } : {}),
  });
  const actions = useKhatmaActions(view, inviteCode);
  const { sheet, busy } = actions;
  const share = useShareSheet();
  const isMember =
    view !== undefined && !("notFound" in view) && view.me.isMember;
  // Only members have notes; everyone else's query is skipped.
  const notes = useQuery(
    api.notes.forKhatma,
    isMember ? { sessionToken, inviteCode } : "skip",
  );

  // The server decides who is signed in; a stored token alone proves nothing.
  const tokenIsDead =
    sessionToken !== undefined &&
    view !== undefined &&
    !("notFound" in view) &&
    !view.me.signedIn;

  // `view` is only defined once Convex has answered for the current args (it is undefined
  // while they change), so a dead token is never judged on a stale answer.
  useClearDeadToken(sessionToken, tokenIsDead);

  const loaded = view !== undefined && !("notFound" in view) ? view : null;
  const openJuz = (loaded?.tiles ?? [])
    .filter((tile) => tile.state === "open")
    .map((tile) => tile.juz);

  // The sheets sit outside the page body so they survive the reload the new session token triggers.
  return (
    <>
      {view === undefined ? (
        <main aria-busy="true" className="mx-auto max-w-xl p-5">
          <p className="py-16 text-center text-xl text-ink-soft">
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
          onContinue={() => void actions.continueToKhatma()}
        />
      ) : (
        <KhatmaContent
          view={view}
          notes={notes ?? []}
          inviteCode={inviteCode}
          busy={busy}
          onTake={actions.take}
          onFinish={() => void actions.finish()}
          onRelease={actions.openRelease}
          onStillReading={() => void actions.stillReading()}
          onDismissNote={(noteId) => void actions.dismissNote(noteId)}
          onSetNotifications={(on) => void actions.setNotifications(on)}
          onInvite={share.openInvite}
          onRemind={share.openRemind}
          hasOpen={openJuz.length > 0}
        />
      )}
      {loaded && loaded.me.isMember && loaded.me.celebrateRound === null && (
        <ShareSheets
          sheet={share.sheet}
          inviteCode={inviteCode}
          khatmaName={khatmaTitle(loaded)}
          openJuz={openJuz}
          targetEndAt={loaded.targetEndAt}
          onClose={share.close}
        />
      )}
      {loaded && sheet?.kind === "take" && (
        <TakeSheet
          juz={sheet.juz}
          takerName={loaded.me.displayName}
          busy={busy}
          onConfirm={() => void actions.confirmTake(sheet.juz)}
          onSwitchAccount={() => void actions.switchAccount(sheet.juz)}
          onClose={actions.closeSheet}
        />
      )}
      {loaded && sheet?.kind === "release" && (
        <ReleaseSheet
          juz={loaded.me.holding}
          busy={busy}
          onConfirm={() => void actions.confirmRelease()}
          onClose={actions.closeSheet}
        />
      )}
      {sheet?.kind === "push" && (
        <PushPromptSheet onClose={actions.closeSheet} />
      )}
      {sheet?.kind === "install" && (
        <InstallStepsSheet onClose={actions.closeSheet} />
      )}
      {sheet?.kind === "whatsapp" && (
        <WhatsAppSheet onClose={actions.closeSheet} />
      )}
      {actions.pendingJuz !== null && (
        <VerifySheet
          title={t.verify.beforeTake}
          intent={{ kind: "take", inviteCode, juz: actions.pendingJuz }}
          onVerified={actions.verified}
          onClose={actions.cancelVerify}
        />
      )}
      {/* Always mounted: screen readers announce text changed inside a live region, not a new one. */}
      <div role="status" aria-live="polite">
        {actions.toast && (
          <Toast
            key={actions.toast.id}
            toast={actions.toast}
            busy={busy}
            onUndo={() => void actions.undo()}
            onDismiss={actions.dismissToast}
          />
        )}
      </div>
    </>
  );
}

function KhatmaContent({
  view,
  notes,
  inviteCode,
  busy,
  onTake,
  onFinish,
  onRelease,
  onStillReading,
  onDismissNote,
  onSetNotifications,
  onInvite,
  onRemind,
  hasOpen,
}: {
  view: KhatmaView;
  notes: NoteView[];
  inviteCode: string;
  busy: boolean;
  onTake: (juz: number) => void;
  onFinish: () => void;
  onRelease: () => void;
  onStillReading: () => void;
  onDismissNote: (noteId: NoteView["noteId"]) => void;
  onSetNotifications: (on: boolean) => void;
  onInvite: () => void;
  onRemind: () => void;
  hasOpen: boolean;
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

      {view.me.isMember && notes.length > 0 && (
        <section aria-label={t.notes.heading} className="mt-4 grid gap-3">
          {notes.map((note) => (
            <NoteCard
              key={note.noteId}
              note={note}
              takeJuz={takeTarget(
                note,
                view.tiles,
                view.me.holding,
                view.me.suggestion,
              )}
              onStillReading={onStillReading}
              onFinish={onFinish}
              onRelease={onRelease}
              onTake={onTake}
              onInvite={onInvite}
              onDismiss={() => onDismissNote(note.noteId)}
              busy={busy}
            />
          ))}
        </section>
      )}

      <Ring tiles={view.tiles} />
      <MainCard
        view={view}
        onTake={onTake}
        onFinish={onFinish}
        onRelease={onRelease}
        onStillReading={onStillReading}
        busy={busy}
      />
      {view.me.isMember && (
        <div className="mt-4 grid gap-3">
          <Button variant="whatsapp" onClick={onInvite}>
            {t.share.inviteButton}
          </Button>
          {hasOpen && (
            <Button variant="ghost" onClick={onRemind}>
              {t.share.remindButton}
            </Button>
          )}
        </div>
      )}
      {view.me.isMember && (
        <SwitchRow
          label={t.khatmaSettings.notifications}
          on={view.me.notificationsOn !== false}
          disabled={busy}
          onChange={onSetNotifications}
        />
      )}
      {view.isOrganizer && (
        <Link
          to={`/j/${encodeURIComponent(inviteCode)}/settings`}
          className="mt-3 inline-flex min-h-14 items-center font-semibold text-green underline underline-offset-4"
        >
          {t.khatmaSettings.link}
        </Link>
      )}
      <PoolGrid tiles={view.tiles} onTake={onTake} />

      {view.completedRounds > 0 && (
        <p className="mt-5 text-center text-ink-soft">
          {t.khatma.groupTotal(toArabicDigits(view.completedRounds))}
        </p>
      )}
    </main>
  );
}
