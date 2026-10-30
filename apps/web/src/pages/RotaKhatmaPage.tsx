import { api } from "@convex/_generated/api";
import type { NoteView } from "@convex/notes";
import { useMutation, useQuery } from "convex/react";
import { useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { buttonClass } from "../components/Button";
import { KhatmaTabs } from "../components/KhatmaTabs";
import { NoteCard } from "../components/NoteCard";
import { canSwitch, SwitchKhatmaSheet } from "../components/SwitchKhatmaSheet";
import {
  ArchivedBanner,
  ArchivedSection,
} from "../features/khatma/ArchivedActions";
import { useSignInSheet } from "../features/verify/useSignInSheet";
import { ErrorLine } from "../features/rota/ErrorLine";
import { PeoplePanel } from "../features/rota/PeoplePanel";
import { TodayPanel } from "../features/rota/TodayPanel";
import { useRotaCall } from "../features/rota/useRotaCall";
import { t } from "../i18n/ar";
import { getSessionToken, useSessionToken } from "../lib/session";

type RotaTab = "today" | "people";

const TABS = [
  { id: "today", label: t.rota.tabs.today },
  { id: "people", label: t.rota.tabs.people },
] as const satisfies readonly { id: RotaTab; label: string }[];

const pill =
  "inline-flex min-h-11 max-w-full items-center rounded-full border-2 border-green px-3.5 text-base font-semibold text-green";

function Loading() {
  return (
    <main aria-busy="true" className="mx-auto max-w-xl p-5">
      <p className="py-16 text-center text-xl text-ink-soft">
        {t.common.loading}
      </p>
    </main>
  );
}

/**
 * Everyone but the organizer: members are on WhatsApp, and have no page to run. A visitor who is
 * signed out may be the organizer on a new phone, so they can sign in from here.
 */
function WhatsAppPage({
  title,
  joinLink,
  onSignIn,
}: {
  title: string;
  /** Opens WhatsApp with the join message typed; null while the khatma has none. */
  joinLink: string | null;
  onSignIn: (() => void) | null;
}) {
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
      <h1 className="font-display text-4xl leading-tight break-words text-green-deep">
        {title}
      </h1>
      <p className="mt-4 text-xl leading-relaxed">{t.rota.whatsappOnly}</p>
      {joinLink && (
        <a
          href={joinLink}
          target="_blank"
          rel="noopener"
          className={buttonClass("whatsapp", "mt-5 no-underline")}
        >
          {t.rota.joinOnWhatsApp}
        </a>
      )}
      {onSignIn && (
        <button
          type="button"
          onClick={onSignIn}
          className="mt-4 min-h-14 font-semibold text-green underline underline-offset-4"
        >
          {t.rota.imOrganizer}
        </button>
      )}
    </main>
  );
}

const noop = () => {};

/** The organizer's notes about the khatma (the unread list, the day's summary), each to dismiss. */
function RotaNotes({ notes }: { notes: NoteView[] }) {
  const dismiss = useMutation(api.notes.dismiss);
  const { busy, error, run } = useRotaCall(t.rota.errors);
  if (notes.length === 0) return null;
  return (
    <section aria-label={t.notes.heading} className="mt-4 grid gap-3">
      {notes.map((note) => (
        <NoteCard
          key={note.noteId}
          note={note}
          takeJuz={null}
          onStillReading={noop}
          onFinish={noop}
          onRelease={noop}
          onTake={noop}
          onInvite={noop}
          onDismiss={() =>
            void run(async () => {
              await dismiss({
                sessionToken: getSessionToken() ?? undefined,
                noteId: note.noteId,
              });
            })
          }
          busy={busy}
        />
      ))}
      <ErrorLine error={error} />
    </section>
  );
}

/** A rotating khatma's page: the organizer's Today and People tabs, or the short WhatsApp page for anyone else. */
export function RotaKhatmaPage({
  inviteCode,
  name,
  joinLink,
}: {
  inviteCode: string;
  /** The khatma's name, which anyone can see. */
  name: string | null;
  /** The wa.me link that joins the khatma, which anyone can use. */
  joinLink: string | null;
}) {
  const sessionToken = useSessionToken();
  const [search, setSearch] = useSearchParams();
  const tab: RotaTab = search.get("tab") === "people" ? "people" : "today";
  const ids = useId();
  const today = useQuery(api.rota.today, { sessionToken, inviteCode });
  const settings = useQuery(
    api.rota.settings,
    today ? { sessionToken, inviteCode } : "skip",
  );
  const notes = useQuery(
    api.notes.forKhatma,
    today ? { sessionToken, inviteCode } : "skip",
  );
  const mine = useQuery(api.khatmas.mine, { sessionToken });
  const me = useQuery(api.sessions.me, { sessionToken });
  const signIn = useSignInSheet();
  const [switching, setSwitching] = useState(false);

  // Tabs replace the entry, so the phone's back leaves the khatma instead of stepping through tabs.
  const setTab = (next: RotaTab) =>
    setSearch(
      (current) => {
        const params = new URLSearchParams(current);
        if (next === "today") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );

  if (today === undefined || (today !== null && settings === undefined)) {
    return <Loading />;
  }
  // Anyone but the organizer; also when the settings say so before today has caught up.
  if (today === null || !settings) {
    // The sheet sits outside the page body so it survives the reload a new session token triggers.
    return (
      <>
        <WhatsAppPage
          title={name ?? t.app.name}
          joinLink={joinLink}
          onSignIn={me === null ? signIn.open : null}
        />
        {signIn.sheet}
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-xl p-5">
        <header className="mb-3.5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1 font-medium text-green"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="rtl:-scale-x-100"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t.nav.back}
          </Link>
        </header>

        <h1 className="min-w-0 font-display text-4xl leading-tight break-words text-green-deep">
          {settings.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to={`/j/${encodeURIComponent(inviteCode)}/settings`}
            className={pill}
          >
            {t.khatmaSettings.link}
          </Link>
          {mine !== undefined && canSwitch(mine, inviteCode) && (
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className={pill}
            >
              {t.nav.switchKhatma}
            </button>
          )}
        </div>

        {today.archived && <ArchivedBanner />}
        <KhatmaTabs tab={tab} onChange={setTab} idPrefix={ids} tabs={TABS} />
        <section
          role="tabpanel"
          id={`${ids}-panel`}
          aria-labelledby={`${ids}-tab-${tab}`}
        >
          {tab === "today" ? (
            <>
              <RotaNotes notes={notes ?? []} />
              <TodayPanel
                inviteCode={inviteCode}
                view={today}
                dayAt={settings.messages.dayAt}
                timeZone={settings.timeZone}
              />
            </>
          ) : (
            <PeoplePanel inviteCode={inviteCode} archived={today.archived} />
          )}
        </section>
        {today.archived && (
          <ArchivedSection
            inviteCode={inviteCode}
            restart={{ days: settings.days, timeZone: settings.timeZone }}
          />
        )}
      </main>
      {signIn.sheet}
      {switching && mine && (
        <SwitchKhatmaSheet
          khatmas={mine}
          currentCode={inviteCode}
          onClose={() => setSwitching(false)}
        />
      )}
    </>
  );
}
