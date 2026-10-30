import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { toArabicDigits } from "@convex/lib/digits";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { t } from "../../i18n/ar";
import { getSessionToken, useSessionToken } from "../../lib/session";
import { AddPersonForm } from "./AddPersonForm";
import { ErrorLine } from "./ErrorLine";
import { StepBar } from "./StepBar";
import { useRotaCall } from "./useRotaCall";

const giveErrors: Record<string, string> = t.rota.giveErrors;

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
  const { busy, error, run } = useRotaCall(giveErrors);
  const juz = view.freeJuz[0];
  // Everyone has a reader now, so there is nothing left to ask.
  if (juz === undefined) return null;

  const choose = (participantId: View["participants"][number]["id"]) =>
    run(() =>
      give({
        sessionToken: getSessionToken() ?? undefined,
        inviteCode,
        participantId,
        juz,
      }),
    );

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
      <ErrorLine error={error} />
    </Sheet>
  );
}

/** Step 2 of 2: add people in order, hand out the leftover ajza', then start the khatma. */
export function RotaPeopleSetup() {
  const { inviteCode = "" } = useParams();
  const navigate = useNavigate();
  const sessionToken = useSessionToken();
  const view = useQuery(api.rota.people, { sessionToken, inviteCode });
  const finishSetup = useMutation(api.rota.finishSetup);
  const finishing = useRotaCall(t.rota.errors);
  const [giving, setGiving] = useState(false);
  const khatmaPath = `/j/${encodeURIComponent(inviteCode)}`;

  if (view === undefined) return <main className="mx-auto max-w-xl p-5" />;
  // Only the organizer sets people up.
  if (view === null) {
    return <Navigate to={khatmaPath} replace />;
  }

  return (
    <main className="mx-auto max-w-xl p-5">
      <h1 className="font-display text-4xl leading-tight text-green-deep">
        {t.rota.setupTitle}
      </h1>
      <StepBar step={2} />

      <div className="mt-5">
        <AddPersonForm inviteCode={inviteCode} />
      </div>

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
        {/* The khatma's days start only once setup is done. */}
        <Button
          disabled={finishing.busy}
          onClick={() =>
            void finishing.run(
              () =>
                finishSetup({
                  sessionToken: getSessionToken() ?? undefined,
                  inviteCode,
                }),
              () => void navigate(khatmaPath),
            )
          }
        >
          {t.rota.done}
        </Button>
        <ErrorLine error={finishing.error} />
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
