import { api } from "@convex/_generated/api";
import { formatDate } from "@web/lib/format";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

type Status = "open" | "answered" | "closed";
const TABS: Status[] = ["open", "answered", "closed"];
const PAGE = 30;

/** The help inbox (spec 5): open requests first, oldest at the top. */
export function HelpInboxPage() {
  const adminToken = useAdminToken() ?? "";
  const [status, setStatus] = useState<Status>("open");
  const {
    results,
    status: loading,
    loadMore,
  } = usePaginatedQuery(
    api.adminHelp.list,
    { adminToken, status },
    { initialNumItems: PAGE },
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-green-deep">{t.help.title}</h1>
      <div role="tablist" className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={tab === status}
            onClick={() => setStatus(tab)}
            className={`rounded-full px-4 py-2 text-sm ${tab === status ? "bg-green text-white" : "border border-line bg-card"}`}
          >
            {t.help.tabs[tab]}
          </button>
        ))}
      </div>
      {loading !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-ink-soft">{t.help.empty}</p>
      )}
      <ul className="flex flex-col gap-2">
        {results.map((r) => (
          <li key={r._id}>
            <Link
              to={`/help/${r._id}`}
              className="block rounded-ui border-2 border-line bg-card px-4 py-3"
            >
              <span className="block font-medium">
                {r.firstLine || t.help.voice}
              </span>
              <span className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-soft">
                <span>{r.who ?? t.help.visitor}</span>
                {r.khatmaName !== null && <span>{r.khatmaName}</span>}
                {r.hasVoice && <span>{t.help.voice}</span>}
                {r.hasScreenshot && <span>{t.help.screenshot}</span>}
                <span>{formatDate(r.createdAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {loading === "CanLoadMore" && (
        <button
          type="button"
          className="font-medium text-green underline underline-offset-4"
          onClick={() => loadMore(PAGE)}
        >
          {t.help.more}
        </button>
      )}
    </div>
  );
}
