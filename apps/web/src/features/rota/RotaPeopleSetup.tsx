import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router";
import { toArabicDigits } from "@convex/lib/digits";
import { buttonClass, Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { t } from "../../i18n/ar";
import { getSessionToken, useSessionToken } from "../../lib/session";
import { StepBar } from "./StepBar";

const addErrors: Record<string, string> = t.rota.addErrors;
const giveErrors: Record<string, string> = t.rota.giveErrors;
const fieldClass =
  "mt-1.5 min-h-14 w-full rounded-ui border-2 border-line bg-white px-4 text-ink";

type View = NonNullable<ReturnType<typeof useQuery<typeof api.rota.people>>>;

/** Who reads each leftover juz' too: one juz' at a time, until none is left. */
function GiveJuzSheet({
  inviteCode,
  view,
  onClose,
}: {
  inviteCode: string;
  view: View;
  onClose: () => void;
}) {
  const give = useMutation(api.rota.giveJuz);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const juz = view.freeJuz[0];
  // Everyone has a reader now, so there is nothing left to ask.
  if (juz === undefined) return null;

  async function choose(participantId: View["participants"][number]["id"]) {
    if (busy || juz === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const result = await give({
        sessionToken: getSessionToken() ?? undefined,
        inviteCode,
        participantId,
        juz,
      });
      if ("error" in result) {
        setError(giveErrors[result.error] ?? t.errors.generic);
      }
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={t.rota.giveTitle(juz)} onClose={onClose}>
      <p className="text-ink-soft">{t.rota.giveHint}</p>
      <ul className="mt-3 grid gap-2">
        {view.participants.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              disabled={busy || person.juz.length >= view.maxSlots}
              onClick={() => void choose(person.id)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-ui border-2 border-line bg-card px-4 text-start disabled:opacity-50"
            >
              <span className="font-medium">
                {person.isMe ? t.rota.me : person.name}
              </span>
              {person.juz.length > 0 && (
                <span className="text-base text-ink-soft">
                  {t.rota.juzOf(person.juz)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** Step 2 of 2: add people in order, hand out the leftover ajza', then on to the khatma. */
export function RotaPeopleSetup() {
  const { inviteCode = "" } = useParams();
  const sessionToken = useSessionToken();
  const view = useQuery(api.rota.people, { sessionToken, inviteCode });
  const addParticipant = useMutation(api.rota.addParticipant);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const addingRef = useRef(false);

  if (view === undefined) return <main className="mx-auto max-w-xl p-5" />;
  // Only the organizer sets people up.
  if (view === null) {
    return <Navigate to={`/j/${encodeURIComponent(inviteCode)}`} replace />;
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(true);
    setError(null);
    try {
      const result = await addParticipant({
        sessionToken: getSessionToken() ?? undefined,
        inviteCode,
        name: name.trim(),
        phone: phone.trim(),
      });
      if ("error" in result) {
        setError(addErrors[result.error] ?? t.errors.generic);
      } else {
        setName("");
        setPhone("");
        nameField.current?.focus();
      }
    } catch {
      setError(t.errors.network);
    } finally {
      addingRef.current = false;
      setAdding(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-4xl leading-tight text-green-deep">
        {t.rota.setupTitle}
      </h1>
      <StepBar step={2} />

      <form onSubmit={(event) => void onAdd(event)} noValidate className="mt-5">
        <label htmlFor="rota-person-name" className="block font-medium">
          {t.rota.personName}
        </label>
        <input
          ref={nameField}
          id="rota-person-name"
          type="text"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
        <label htmlFor="rota-person-phone" className="mt-4 block font-medium">
          {t.rota.personPhone}
        </label>
        <input
          id="rota-person-phone"
          type="text"
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          aria-describedby="rota-phone-hint"
          className={`${fieldClass} text-right`}
        />
        <p id="rota-phone-hint" className="mt-1 text-base text-ink-soft">
          {t.rota.phoneHint}
        </p>
        {error && (
          <p role="alert" className="mt-3 font-medium text-[#8A2B1E]">
            {error}
          </p>
        )}
        <div className="mt-4">
          <Button type="submit" variant="ghost" disabled={adding}>
            {adding ? t.rota.adding : t.rota.add}
          </Button>
        </div>
      </form>

      <ol
        aria-label={t.rota.peopleList}
        className="mt-5 divide-y divide-line rounded-ui border-2 border-line bg-card px-4"
      >
        {view.participants.map((person, index) => (
          <li key={person.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="w-7 shrink-0 text-center font-semibold text-green-deep">
              {toArabicDigits(index + 1)}
            </span>
            <span className="font-medium">
              {person.isMe ? t.rota.me : person.name}
            </span>
            {person.juz.length > 0 && (
              <span className="ms-auto text-base text-ink-soft">
                {t.rota.juzOf(person.juz)}
              </span>
            )}
          </li>
        ))}
      </ol>

      {view.freeJuz.length > 0 && (
        <button
          type="button"
          onClick={() => setGiving(true)}
          className="mt-4 block min-h-14 w-full rounded-ui border-2 border-gold bg-[#FBF1D9] px-4 py-3 text-start"
        >
          <span className="block font-medium">
            {t.rota.leftover(view.freeJuz)}
          </span>
          <span className="block text-base text-ink-soft">
            {t.rota.leftoverHint}
          </span>
        </button>
      )}

      <div className="mt-6">
        <Link
          to={`/j/${encodeURIComponent(inviteCode)}`}
          className={buttonClass("primary")}
        >
          {t.rota.done}
        </Link>
      </div>

      {giving && view.freeJuz.length > 0 && (
        <GiveJuzSheet
          inviteCode={inviteCode}
          view={view}
          onClose={() => setGiving(false)}
        />
      )}
    </main>
  );
}
