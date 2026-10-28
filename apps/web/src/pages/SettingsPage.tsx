import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button, buttonClass } from "../components/Button";
import { InstallStepsSheet } from "../components/InstallStepsSheet";
import { SwitchRow } from "../components/SwitchRow";
import { t } from "../i18n/ar";
import { errorCode } from "../lib/errors";
import { useSignInSheet } from "../features/verify/useSignInSheet";
import { formatDate } from "../lib/format";
import {
  currentEndpoint,
  dropSubscription,
  enablePush,
  pushBlocked,
  pushSupport,
} from "../lib/push";
import { clearSessionToken, useSessionToken } from "../lib/session";
import { useClearDeadToken } from "../lib/useClearDeadToken";

const headingClass = "mt-8 mb-3 text-xl font-semibold";
const settingsErrors: Record<string, string> = t.settings.errors;

export function SettingsPage() {
  const sessionToken = useSessionToken();
  const me = useQuery(api.sessions.me, { sessionToken });
  useClearDeadToken(sessionToken, me === null);
  const signIn = useSignInSheet();

  // The sheet sits outside the page body so it survives the reload a new session token triggers.
  return (
    <>
      {me === undefined ? (
        <main aria-busy="true" className="mx-auto max-w-xl p-5">
          <p className="py-16 text-center text-xl text-ink-soft">
            {t.common.loading}
          </p>
        </main>
      ) : (
        <SettingsContent me={me} onSignIn={signIn.open} />
      )}
      {signIn.sheet}
    </>
  );
}

function SettingsContent({
  me,
  onSignIn,
}: {
  me: { displayName: string; maskedPhone: string } | null;
  onSignIn: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl p-5">
      {/* Signed in, the bottom bar has the way home. */}
      {me === null && (
        <header className="mb-3.5">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-medium text-green underline underline-offset-4"
          >
            {t.common.home}
          </Link>
        </header>
      )}
      <h1 className="font-display text-4xl leading-tight text-green-deep">
        {t.home.settings}
      </h1>
      {me === null ? (
        <>
          <p className="mt-4 leading-relaxed text-ink-soft">
            {t.settings.signedOutPrompt}
          </p>
          <div className="mt-5">
            <Button variant="ghost" onClick={onSignIn}>
              {t.signIn.button}
            </Button>
          </div>
        </>
      ) : (
        <SignedInSettings
          displayName={me.displayName}
          maskedPhone={me.maskedPhone}
        />
      )}
    </main>
  );
}

function SignedInSettings({
  displayName,
  maskedPhone,
}: {
  displayName: string;
  maskedPhone: string;
}) {
  return (
    <>
      <NameForm initial={displayName} />
      <p className="mt-5">
        <span className="font-medium">{t.settings.numberLabel}: </span>
        <span dir="ltr">{maskedPhone}</span>
      </p>
      <MyNumbers />
      <DevicePush />
      <Devices />
    </>
  );
}

/** The person's own numbers. Nobody else is ever sent these. */
function MyNumbers() {
  const sessionToken = useSessionToken();
  const stats = useQuery(api.people.myStats, { sessionToken });
  if (!stats) return null;
  return (
    <section aria-labelledby="numbers-heading">
      <h2 id="numbers-heading" className={headingClass}>
        {t.settings.numbers}
      </h2>
      <div className="grid gap-2 rounded-ui border border-line bg-card p-4">
        <p>
          {stats.juzRead > 0
            ? t.settings.juzRead(stats.juzRead)
            : t.settings.noJuzYet}
        </p>
        {stats.paceDays !== null && <p>{t.card.pace(stats.paceDays)}</p>}
        {stats.weekStreak !== null && (
          <p>{t.settings.weekStreak(stats.weekStreak)}</p>
        )}
      </div>
    </section>
  );
}

function DevicePush() {
  const support = pushSupport();
  return (
    <section aria-labelledby="push-heading">
      <h2 id="push-heading" className={headingClass}>
        {t.settings.pushHeading}
      </h2>
      {support === "unsupported" ? (
        <p className="leading-relaxed text-ink-soft">
          {t.settings.pushUnsupported}
        </p>
      ) : support === "ios_install" ? (
        <IosInstall />
      ) : (
        <PushSwitch />
      )}
    </section>
  );
}

/** On iPhone, push needs the home-screen app: this is the way back to those steps. */
function IosInstall() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <p className="leading-relaxed text-ink-soft">
        {t.settings.pushInstallHint}
      </p>
      <div className="mt-3">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {t.settings.pushInstall}
        </Button>
      </div>
      {open && <InstallStepsSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function PushSwitch() {
  const sessionToken = useSessionToken();
  const unsubscribe = useMutation(api.push.unsubscribe);
  // undefined while the browser is asked; null when it has no subscription.
  const [endpoint, setEndpoint] = useState<string | null | undefined>(
    undefined,
  );
  const mine = useQuery(
    api.push.mine,
    endpoint && sessionToken ? { sessionToken, endpoint } : "skip",
  );
  const [blocked, setBlocked] = useState(pushBlocked);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    currentEndpoint().then(
      (found) => live && setEndpoint(found),
      () => live && setEndpoint(null),
    );
    return () => {
      live = false;
    };
  }, []);

  if (blocked) {
    return (
      <p className="leading-relaxed text-ink-soft">{t.settings.pushBlocked}</p>
    );
  }
  if (endpoint === undefined) return null;

  const on = endpoint !== null && mine?.thisDevice === true;

  async function change(turnOn: boolean) {
    if (busyRef.current || !sessionToken) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (turnOn) {
        // Straight from the tap: the permission dialog needs the gesture.
        const result = await enablePush(sessionToken);
        if (result === "denied") setBlocked(true);
        else setEndpoint(await currentEndpoint());
      } else {
        const dropped = await dropSubscription();
        setEndpoint(null);
        if (dropped) await unsubscribe({ sessionToken, endpoint: dropped });
      }
    } catch {
      setError(t.errors.network);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <SwitchRow
        label={t.settings.pushLabel}
        on={on}
        disabled={busy}
        onChange={(next) => void change(next)}
      />
      {error && (
        <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
          {error}
        </p>
      )}
    </>
  );
}

function NameForm({ initial }: { initial: string }) {
  const sessionToken = useSessionToken();
  const update = useMutation(api.people.updateDisplayName);
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const trimmed = name.trim();
      await update({ sessionToken, displayName: trimmed });
      setName(trimmed);
      setSaved(true);
    } catch (caught) {
      const code = errorCode(caught);
      setError(
        code === null
          ? t.settings.errors.network
          : (settingsErrors[code] ?? t.errors.generic),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      noValidate
      className="mt-5"
    >
      <label htmlFor="display-name" className="block font-medium">
        {t.settings.nameLabel}
      </label>
      <input
        id="display-name"
        type="text"
        autoComplete="name"
        maxLength={40}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setSaved(false);
        }}
        aria-invalid={error !== null}
        className="mt-1.5 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink"
      />
      {error && (
        <p role="alert" className="mt-2 font-medium text-[#8A2B1E]">
          {error}
        </p>
      )}
      <p role="status" className="mt-2 font-medium text-green">
        {saved ? t.settings.saved : ""}
      </p>
      <div className="mt-3">
        <Button type="submit" disabled={saving}>
          {saving ? t.settings.saving : t.settings.save}
        </Button>
      </div>
    </form>
  );
}

function Devices() {
  const sessionToken = useSessionToken();
  const navigate = useNavigate();
  const sessions = useQuery(api.sessions.list, { sessionToken });
  const signOut = useMutation(api.sessions.signOut);
  const signOutOne = useMutation(api.sessions.signOutOne);
  const signOutOthers = useMutation(api.sessions.signOutOthers);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** One call at a time; a thrown call is shown as a network failure. */
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await work();
    } catch {
      setError(t.errors.network);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const signOutThisDevice = () =>
    run(async () => {
      await signOut({ sessionToken });
      clearSessionToken();
      void navigate("/");
    });
  const signOutDevice = (sessionId: Id<"sessions">) =>
    run(async () => {
      await signOutOne({ sessionToken, sessionId });
      setMessage(t.settings.signedOutOne);
    });
  const signOutOtherDevices = () =>
    run(async () => {
      await signOutOthers({ sessionToken });
      setMessage(t.settings.signedOutOthers);
    });

  return (
    <section aria-labelledby="devices-heading">
      <h2 id="devices-heading" className={headingClass}>
        {t.settings.devicesHeading}
      </h2>
      <ul className="grid gap-3">
        {(sessions ?? []).map((s) => (
          <li
            key={s.sessionId}
            className="rounded-ui border border-line bg-card p-4"
          >
            <span className="block font-medium">{s.deviceLabel}</span>
            {s.isCurrent && (
              <span className="mt-1 inline-block rounded-full bg-saffron-soft px-3 py-0.5 text-base font-semibold text-saffron-ink">
                {t.settings.thisDevice}
              </span>
            )}
            <span className="mt-1 block text-base text-ink-soft">
              {t.settings.lastUsed(formatDate(s.lastUsedAt))}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void (s.isCurrent
                  ? signOutThisDevice()
                  : signOutDevice(s.sessionId))
              }
              className={buttonClass("ghost", "mt-3")}
            >
              {t.settings.signOut}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
          {error}
        </p>
      )}
      <p role="status" className="mt-3 font-medium text-green">
        {message}
      </p>
      <div className="mt-3">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => void signOutOtherDevices()}
        >
          {t.settings.signOutOthers}
        </Button>
      </div>
    </section>
  );
}
