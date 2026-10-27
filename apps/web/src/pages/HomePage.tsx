import { api } from "@convex/_generated/api";
import { toArabicDigits } from "@convex/lib/digits";
import { JUZ } from "@convex/lib/juz";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Link } from "react-router";
import { buttonClass } from "../components/Button";
import { t } from "../i18n/ar";
import { formatDate } from "../lib/format";
import { useSessionToken } from "../lib/session";

const TOTAL = 30;

export function HomePage() {
  const sessionToken = useSessionToken();
  const me = useQuery(api.sessions.me, { sessionToken });
  const mine = useQuery(api.khatmas.mine, { sessionToken });

  if (me === undefined || mine === undefined) {
    return (
      <main aria-busy="true" className="mx-auto max-w-xl p-5">
        <p className="py-16 text-center text-xl text-ink-soft">
          {t.common.loading}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-5">
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <span className="font-display text-2xl text-green">{t.app.name}</span>
        {me && (
          <Link
            to="/settings"
            className="inline-flex min-h-11 items-center font-medium text-green underline underline-offset-4"
          >
            {t.home.settings}
          </Link>
        )}
      </header>

      {me ? (
        <>
          <h1 className="mb-1 text-2xl font-semibold">
            {t.home.hello(me.displayName)}
          </h1>
          <h2 className="mb-3 text-ink-soft">{t.pages.home}</h2>
          {mine.length === 0 ? (
            <p className="mb-5 rounded-ui border border-line bg-card p-4 leading-relaxed">
              {t.home.empty}
            </p>
          ) : (
            <ul className="grid gap-3">
              {mine.map((khatma) => (
                <li key={khatma.inviteCode}>
                  <KhatmaCard khatma={khatma} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5">
            <Link
              to="/new"
              className={buttonClass(
                mine.length === 0 ? "primary" : "ghost",
                mine.length === 0
                  ? ""
                  : "border-dashed font-semibold text-green",
              )}
            >
              {mine.length === 0 ? t.home.startNewPlain : t.home.startNew}
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{t.home.helloAnon}</h1>
          <p className="mb-5 leading-relaxed text-ink-soft">
            {t.home.signedOutIntro}
          </p>
          <Link to="/new" className={buttonClass("primary")}>
            {t.home.startNewPlain}
          </Link>
        </>
      )}
    </main>
  );
}

type Card = FunctionReturnType<typeof api.khatmas.mine>[number];

function KhatmaCard({ khatma }: { khatma: Card }) {
  const total = toArabicDigits(TOTAL);
  const done = toArabicDigits(khatma.done);
  const name = khatma.name ?? t.khatma.untitled(formatDate(khatma.createdAt));
  const heldName =
    khatma.holding === null
      ? null
      : JUZ.find((j) => j.number === khatma.holding)?.name;
  return (
    <Link
      to={`/j/${encodeURIComponent(khatma.inviteCode)}`}
      className="block rounded-[22px] border border-line bg-card px-[18px] py-4"
    >
      <span className="block font-display text-2xl text-green-deep">
        {name}
      </span>
      <span
        role="progressbar"
        aria-label={t.ring.label(done, total)}
        aria-valuemin={0}
        aria-valuemax={TOTAL}
        aria-valuenow={khatma.done}
        className="my-2.5 block h-3 overflow-hidden rounded-full bg-paper-2"
      >
        <span
          className="block h-full rounded-full bg-green"
          style={{ width: `${(khatma.done / TOTAL) * 100}%` }}
        />
      </span>
      <span className="flex justify-between gap-3 text-base text-ink-soft">
        <span>{t.home.doneOf(done, total)}</span>
        <span>{t.schedules[khatma.schedule]}</span>
      </span>
      {khatma.holding !== null && (
        <span className="mt-2 inline-block rounded-full bg-saffron-soft px-3 py-1 text-base font-semibold text-saffron-ink">
          {t.home.yours(toArabicDigits(khatma.holding), heldName ?? "")}
        </span>
      )}
    </Link>
  );
}
