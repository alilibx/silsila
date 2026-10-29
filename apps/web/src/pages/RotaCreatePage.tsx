import { api } from "@convex/_generated/api";
import { addDays, type ReadingDays } from "@convex/lib/rota";
import { localDate } from "@convex/lib/wakingTime";
import { useAction, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { Button } from "../components/Button";
import { DateLine } from "../features/rota/DateLine";
import { firstReadingDay } from "../features/rota/dates";
import { formatIsoDate } from "../features/rota/format";
import { ReadingDaysField } from "../features/rota/ReadingDaysField";
import { StepBar } from "../features/rota/StepBar";
import { t } from "../i18n/ar";
import { errorCode } from "../lib/errors";
import { getSessionToken, useSessionToken } from "../lib/session";

const rotaErrors: Record<string, string> = t.rota.errors;

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
            // A start that is not a reading day moves on; the field shows where it landed.
            inputValue={pickedStart === null ? "" : start}
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
