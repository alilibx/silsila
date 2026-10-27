import { api } from "@convex/_generated/api";
import type { KhatmaView } from "@convex/khatmas";
import { toArabicDigits } from "@convex/lib/digits";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { MainCard } from "../components/MainCard";
import { PoolGrid } from "../components/PoolGrid";
import { Ring } from "../components/Ring";
import { VerifySheet } from "../features/verify/VerifySheet";
import { t } from "../i18n/ar";
import { formatDate } from "../lib/format";
import { useSessionToken } from "../lib/session";
import { NotFoundPage } from "./NotFoundPage";

const chip =
  "rounded-full border border-line bg-paper-2 px-3 py-1 text-base text-ink-soft";

/** Placeholder until the take sheet exists. */
function openTakeSheet(juz: number): void {
  void juz; // take sheet: Task 12
}

export function KhatmaPage() {
  const { inviteCode = "" } = useParams();
  const [search] = useSearchParams();
  const from = search.get("from");
  const sessionToken = useSessionToken();
  // The juz' a signed-out visitor tapped; it also means the verify sheet is open.
  const [pendingJuz, setPendingJuz] = useState<number | null>(null);
  const view = useQuery(api.khatmas.view, {
    sessionToken,
    inviteCode,
    ...(from ? { from } : {}),
  });

  const take = (juz: number) => {
    if (sessionToken) openTakeSheet(juz);
    else setPendingJuz(juz);
  };
  const verified = () => {
    const juz = pendingJuz;
    setPendingJuz(null);
    if (juz !== null) openTakeSheet(juz);
  };

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
      ) : (
        <KhatmaContent view={view} onTake={take} />
      )}
      {pendingJuz !== null && (
        <VerifySheet
          title={t.verify.beforeTake}
          onVerified={verified}
          onClose={() => setPendingJuz(null)}
        />
      )}
    </>
  );
}

function KhatmaContent({
  view,
  onTake,
}: {
  view: KhatmaView;
  onTake: (juz: number) => void;
}) {
  const title = view.name ?? t.khatma.untitled(formatDate(view.createdAt));

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
        onFinish={() => {}} // wired in Task 12
        onRelease={() => {}} // wired in Task 12
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
