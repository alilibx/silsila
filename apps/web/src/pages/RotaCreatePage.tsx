import { api } from "@convex/_generated/api";
import { addDays, nextReadingDates, type ReadingDays } from "@convex/lib/rota";
import { localDate } from "@convex/lib/wakingTime";
import { useAction, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { formatIsoDate } from "../features/rota/format";
import { ReadingDaysField } from "../features/rota/ReadingDaysField";
import { StepBar } from "../features/rota/StepBar";
import { t } from "../i18n/ar";
import { errorCode } from "../lib/errors";
import { getSessionToken, useSessionToken } from "../lib/session";

const rotaErrors: Record<string, string> = t.rota.errors;

/** The first reading day on or after `from`; `from` itself when none is found. */
function firstReadingDay(days: ReadingDays, from: string): string {
  return nextReadingDates(days, from, from, 1, new Set())[0] ?? from;
}

/** One line of the start or the end: its value and a button that opens a native date field. */
function DateLine({
  label,
  value,
  inputLabel,
  inputValue,
  min,
  onPick,
  clearLabel,
}: {
  label: string;
  value: string;
  inputLabel: string;
  inputValue: string;
  min: string;
  onPick: (date: string | null) => void;
  /** When set, a button that clears the date (the end line goes back to no end). */
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-ui border-2 border-line bg-card px-4 py-2">
      <div className="flex min-h-14 items-center justify-between gap-3">
        <span>
          <span className="block text-base text-ink-soft">{label}</span>
          <span className="font-medium">{value}</span>
        </span>
        <button
          type="button"
          aria-label={`${label}: ${t.rota.change}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="min-h-14 px-3 font-medium text-green underline underline-offset-4"
        >
          {t.rota.change}
        </button>
      </div>
      {open && (
        <div className="pb-2">
          <input
            type="date"
            aria-label={inputLabel}
            min={min}
            value={inputValue}
            onChange={(event) => onPick(event.target.value || null)}
            className="min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink"
          />
          {clearLabel && inputValue !== "" && (
            <button
              type="button"
              onClick={() => {
                onPick(null);
                setOpen(false);
              }}
              className="mt-1 min-h-14 font-medium text-green underline underline-offset-4"
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Step 1 of 2: the name and the reading days. Only for people an admin turned rota khatmas on for. */
export function RotaCreatePage() {
  const navigate = useNavigate();
  const sessionToken = useSessionToken();
  const me = useQuery(api.people.me, { sessionToken });
  const createRota = useAction(api.rota.create);
  const [name, setName] = useState("");
  const [days, setDays] = useState<ReadingDays>({ kind: "daily" });
  // `null` while the start follows "tomorrow"; only a picked date is kept.
  const [pickedStart, setPickedStart] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  if (me === undefined) return <main className="mx-auto max-w-xl p-5" />;
  if (me === null || !me.rotaAllowed) return <Navigate to="/new" replace />;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tomorrow = addDays(localDate(Date.now(), timeZone), 1);
  // The first day must be a reading day, so the start moves on to the next one.
  const start = firstReadingDay(days, pickedStart ?? tomorrow);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const { inviteCode } = await createRota({
        sessionToken: getSessionToken() ?? undefined,
        name: name.trim(),
        days,
        firstDate: start,
        endDate,
      });
      void navigate(`/j/${encodeURIComponent(inviteCode)}/setup`);
    } catch (caught) {
      const code = errorCode(caught);
      creatingRef.current = false;
      setCreating(false);
      setError(
        code === null
          ? t.errors.network
          : (rotaErrors[code] ?? t.errors.generic),
      );
    }
  }

  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-4xl leading-tight text-green-deep">
        {t.pages.create}
      </h1>
      <StepBar step={1} />

      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="mt-5"
      >
        <label htmlFor="rota-name" className="block text-xl font-semibold">
          {t.rota.nameQuestion}
        </label>
        <input
          id="rota-name"
          type="text"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.rota.namePlaceholder}
          className="mt-2 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink"
        />

        <div className="mt-6">
          <ReadingDaysField
            value={days}
            onChange={(next) => {
              setDays(next);
              setError(null);
            }}
          />
        </div>

        <div className="mt-4 grid gap-2.5">
          <DateLine
            label={t.rota.startLabel}
            value={
              start === tomorrow
                ? t.rota.tomorrow(formatIsoDate(start))
                : formatIsoDate(start)
            }
            inputLabel={t.rota.startDateInput}
            inputValue={pickedStart ?? ""}
            min={tomorrow}
            onPick={(date) => {
              setPickedStart(date);
              setError(null);
            }}
          />
          <DateLine
            label={t.rota.endLabel}
            value={endDate === null ? t.rota.noEnd : formatIsoDate(endDate)}
            inputLabel={t.rota.endDateInput}
            inputValue={endDate ?? ""}
            min={start}
            onPick={(date) => {
              setEndDate(date);
              setError(null);
            }}
            clearLabel={t.rota.noEnd}
          />
        </div>

        {error && (
          <p role="alert" className="mt-4 font-medium text-[#8A2B1E]">
            {error}
          </p>
        )}
        <div className="mt-6">
          <Button type="submit" disabled={creating}>
            {creating ? t.rota.creating : t.rota.next}
          </Button>
        </div>
      </form>
    </main>
  );
}
