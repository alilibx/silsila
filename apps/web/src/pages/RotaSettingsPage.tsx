import { api } from "@convex/_generated/api";
import type { ReadingDays, RotaMessages } from "@convex/lib/rota";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router";
import { Button } from "../components/Button";
import { Sheet } from "../components/Sheet";
import { SwitchRow } from "../components/SwitchRow";
import { DateLine } from "../features/rota/DateLine";
import { thrownMessage } from "../features/rota/errors";
import { firstReadingDay } from "../features/rota/dates";
import { formatIsoDate, formatTime } from "../features/rota/format";
import { ReadingDaysField } from "../features/rota/ReadingDaysField";
import { TimeField } from "../features/rota/TimeField";
import { t } from "../i18n/ar";
import { getSessionToken, useSessionToken } from "../lib/session";

type Settings = NonNullable<
  ReturnType<typeof useQuery<typeof api.rota.settings>>
>;
type SectionId = "pause" | "messages" | "details";
type Feedback = { section: SectionId; kind: "saved" | "error"; text: string };
type Message = "reminder" | "unread" | "summary";

const rotaErrors: Record<string, string> = t.rota.errors;
const MESSAGES: Message[] = ["reminder", "unread", "summary"];
const fieldClass =
  "mt-1.5 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink";

const khatmaPath = (inviteCode: string) =>
  `/j/${encodeURIComponent(inviteCode)}`;

/** The zones this browser knows, the khatma's own first. */
function timeZones(current: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return [current, ...known.filter((zone) => zone !== current)];
}

const sameDays = (a: ReadingDays, b: ReadingDays) =>
  JSON.stringify(a) === JSON.stringify(b);

function Section({
  id,
  heading,
  feedback,
  children,
}: {
  id: SectionId;
  heading: string;
  feedback: Feedback | null;
  children: ReactNode;
}) {
  const own = feedback?.section === id ? feedback : null;
  return (
    <section aria-label={heading} className="mt-8">
      <h2 className="mb-3 text-xl font-semibold">{heading}</h2>
      {children}
      {own?.kind === "error" && (
        <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
          {own.text}
        </p>
      )}
      <p role="status" className="mt-3 font-medium text-green">
        {own?.kind === "saved" ? own.text : ""}
      </p>
    </section>
  );
}

/** A rotating khatma's settings for its organizer: pausing, the message times, the days and the name. */
export function RotaSettingsPage() {
  const { inviteCode = "" } = useParams();
  const sessionToken = useSessionToken();
  const settings = useQuery(api.rota.settings, { sessionToken, inviteCode });

  if (settings === undefined) {
    return (
      <main aria-busy="true" className="mx-auto max-w-xl p-5">
        <p className="py-16 text-center text-xl text-ink-soft">
          {t.common.loading}
        </p>
      </main>
    );
  }
  // Only the organizer has settings.
  if (settings === null) {
    return <Navigate to={khatmaPath(inviteCode)} replace />;
  }
  return <SettingsContent settings={settings} inviteCode={inviteCode} />;
}

function SettingsContent({
  settings,
  inviteCode,
}: {
  settings: Settings;
  inviteCode: string;
}) {
  const update = useMutation(api.rota.update);
  const setPaused = useMutation(api.rota.setPaused);
  const addPauseDate = useMutation(api.rota.addPauseDate);
  const removePauseDate = useMutation(api.rota.removePauseDate);
  const [name, setName] = useState(settings.name);
  const [days, setDays] = useState<ReadingDays>(settings.days);
  const [endDate, setEndDate] = useState<string | null>(settings.endDate);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [addingDate, setAddingDate] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const args = { sessionToken: getSessionToken() ?? undefined, inviteCode };

  const paused = settings.pausedAt !== null;
  const { messages, quiet } = settings;
  const earliest = quiet.endHour * 60;
  const latest = quiet.startHour * 60 - 15;

  // A start still ahead moves on to the first reading day of the new days; one behind us stays.
  const start = settings.firstDatePassed
    ? settings.firstDate
    : firstReadingDay(days, settings.firstDate);
  const changes = {
    ...(name.trim() !== settings.name ? { name: name.trim() } : {}),
    ...(!sameDays(days, settings.days)
      ? {
          days,
          ...(start !== settings.firstDate ? { firstDate: start } : {}),
        }
      : {}),
    ...(endDate !== settings.endDate ? { endDate } : {}),
    ...(timeZone !== settings.timeZone ? { timeZone } : {}),
  };
  const changed = Object.keys(changes).length > 0;

  /**
   * One call at a time. `work` returns the copy of a refusal, or null when it went through;
   * the result shows under `section`.
   */
  async function run(
    section: SectionId,
    work: () => Promise<string | null>,
    saved: string | null = null,
  ): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const refusal = await work();
      if (refusal !== null) {
        setFeedback({ section, kind: "error", text: refusal });
      } else if (saved !== null) {
        setFeedback({ section, kind: "saved", text: saved });
      }
    } catch (caught) {
      setFeedback({ section, kind: "error", text: thrownMessage(caught) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  /** The result of a call that answers `{ ok }` or `{ error }`, as the refusal to show or null. */
  const refusal = (result: { ok: true } | { error: string }) =>
    "error" in result ? (rotaErrors[result.error] ?? t.errors.generic) : null;

  const saveMessages = (next: RotaMessages) =>
    run(
      "messages",
      async () => refusal(await update({ ...args, messages: next })),
      t.organizer.saved,
    );

  const pickPauseDate = (date: string) => {
    setAddingDate(false);
    return run("pause", async () =>
      refusal(await addPauseDate({ ...args, date })),
    );
  };

  const offeredDates = settings.upcoming.filter(
    (date) => !settings.pauseDates.includes(date),
  );

  return (
    <>
      <main className="mx-auto max-w-xl p-5">
        <header className="mb-3.5">
          <Link
            to={khatmaPath(inviteCode)}
            className="inline-flex min-h-11 items-center font-medium text-green underline underline-offset-4"
          >
            {t.organizer.back}
          </Link>
        </header>
        <h1 className="font-display text-4xl leading-tight text-green-deep">
          {t.khatmaSettings.link}
        </h1>

        <Section id="pause" heading={t.rota.pauseHeading} feedback={feedback}>
          <SwitchRow
            label={t.rota.pauseNow}
            on={paused}
            disabled={busy}
            onChange={(next) =>
              void run("pause", async () => {
                await setPaused({ ...args, paused: next });
                return null;
              })
            }
          />
          <p className="mt-2 text-ink-soft">{t.rota.pauseHint}</p>

          <h3 className="mt-5 font-medium">{t.rota.pauseDates}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {settings.pauseDates.map((date) => (
              <li key={date}>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={t.rota.removeDate(formatIsoDate(date))}
                  onClick={() =>
                    void run("pause", async () =>
                      refusal(await removePauseDate({ ...args, date })),
                    )
                  }
                  className="min-h-12 rounded-full border-2 border-saffron bg-saffron-soft px-4 font-medium text-saffron-ink disabled:opacity-50"
                >
                  {formatIsoDate(date)} ×
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAddingDate(true)}
                className="min-h-12 rounded-full border-2 border-dashed border-green px-4 font-semibold text-green disabled:opacity-50"
              >
                {t.rota.addDate}
              </button>
            </li>
          </ul>
          <p className="mt-2 text-base text-ink-soft">
            {t.rota.pauseDatesHint}
          </p>
        </Section>

        <Section
          id="messages"
          heading={t.rota.messagesHeading}
          feedback={feedback}
        >
          <p className="text-ink-soft">
            {t.rota.messagesHint(formatTime(earliest), formatTime(latest))}
          </p>
          <div className="mt-3 rounded-ui border-2 border-line bg-card px-4 py-3">
            <p className="font-medium">{t.rota.messageNames.dayAt}</p>
            <TimeField
              value={messages.dayAt}
              min={earliest}
              max={latest}
              disabled={busy}
              onChange={(at) => void saveMessages({ ...messages, dayAt: at })}
            />
            <p className="mt-2 text-base text-ink-soft">{t.rota.locked}</p>
          </div>
          {MESSAGES.map((key) => (
            <div
              key={key}
              className="mt-3 rounded-ui border-2 border-line bg-card px-4 pb-3"
            >
              <SwitchRow
                label={t.rota.messageNames[key]}
                on={messages[key].on}
                disabled={busy}
                onChange={(on) =>
                  void saveMessages({
                    ...messages,
                    [key]: { ...messages[key], on },
                  })
                }
              />
              {messages[key].on && (
                <TimeField
                  value={messages[key].at}
                  min={earliest}
                  max={latest}
                  disabled={busy}
                  onChange={(at) =>
                    void saveMessages({
                      ...messages,
                      [key]: { ...messages[key], at },
                    })
                  }
                />
              )}
            </div>
          ))}
        </Section>

        <Section
          id="details"
          heading={t.rota.detailsHeading}
          feedback={feedback}
        >
          <label htmlFor="rota-settings-name" className="block font-medium">
            {t.rota.nameLabel}
          </label>
          <input
            id="rota-settings-name"
            type="text"
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />

          <div className="mt-6">
            <ReadingDaysField value={days} onChange={setDays} />
          </div>

          <div className="mt-4 grid gap-2.5">
            <div className="rounded-ui border-2 border-line bg-card px-4 py-3">
              <span className="block text-base text-ink-soft">
                {t.rota.startLabel}
              </span>
              <span className="font-medium">{formatIsoDate(start)}</span>
            </div>
            <DateLine
              label={t.rota.endLabel}
              value={endDate === null ? t.rota.noEnd : formatIsoDate(endDate)}
              inputLabel={t.rota.endDateInput}
              inputValue={endDate ?? ""}
              min={start}
              onPick={setEndDate}
              clearLabel={t.rota.noEnd}
            />
          </div>

          <label
            htmlFor="rota-settings-zone"
            className="mt-6 block font-medium"
          >
            {t.rota.timeZoneLabel}
          </label>
          <select
            id="rota-settings-zone"
            dir="ltr"
            value={timeZone}
            onChange={(event) => setTimeZone(event.target.value)}
            className={`${fieldClass} text-end`}
          >
            {timeZones(settings.timeZone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="mt-1 text-base text-ink-soft">{t.rota.timeZoneHint}</p>

          <div className="mt-4">
            <Button
              disabled={busy || !changed || name.trim() === ""}
              onClick={() =>
                void run(
                  "details",
                  async () => refusal(await update({ ...args, ...changes })),
                  t.organizer.saved,
                )
              }
            >
              {t.organizer.save}
            </Button>
          </div>
        </Section>
      </main>

      {addingDate && (
        <Sheet
          title={t.rota.pickDateTitle}
          onClose={() => setAddingDate(false)}
        >
          {offeredDates.length === 0 ? (
            <p className="text-ink-soft">{t.rota.noUpcoming}</p>
          ) : (
            <ul className="grid gap-2">
              {offeredDates.map((date) => (
                <li key={date}>
                  <button
                    type="button"
                    onClick={() => void pickPauseDate(date)}
                    className="min-h-14 w-full rounded-ui border-2 border-line bg-card px-4 text-start font-medium"
                  >
                    {formatIsoDate(date)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}
