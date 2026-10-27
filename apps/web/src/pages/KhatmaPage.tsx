import { api } from "@convex/_generated/api";
import { toArabicDigits } from "@convex/lib/digits";
import { useQuery } from "convex/react";
import { Link, useParams, useSearchParams } from "react-router";
import { MainCard } from "../components/MainCard";
import { PoolGrid } from "../components/PoolGrid";
import { Ring } from "../components/Ring";
import { t } from "../i18n/ar";
import { formatDate } from "../lib/format";
import { useSessionToken } from "../lib/session";
import { NotFoundPage } from "./NotFoundPage";

const chip =
  "rounded-full border border-line bg-paper-2 px-3 py-1 text-base text-ink-soft";

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

  if (view === undefined) {
    return (
      <main className="mx-auto max-w-xl p-5">
        <p role="status" className="py-16 text-center text-xl text-ink-soft">
          {t.common.loading}
        </p>
      </main>
    );
  }
  if ("notFound" in view) return <NotFoundPage />;

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
        onTake={() => {}} // wired in Task 12
        onFinish={() => {}} // wired in Task 12
        onRelease={() => {}} // wired in Task 12
      />
      <PoolGrid
        tiles={view.tiles}
        onTake={() => {}} // wired in Task 12
      />

      {view.completedRounds > 0 && (
        <p className="mt-5 text-center text-ink-soft">
          {t.khatma.groupTotal(toArabicDigits(view.completedRounds))}
        </p>
      )}
    </main>
  );
}
