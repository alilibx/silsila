import { api } from "@convex/_generated/api";
import type { AuditAction } from "@convex/lib/audit";
import { SETTING_SPECS } from "@convex/lib/settingSpecs";
import type { SettingKey } from "@convex/lib/settings";
import { formatDate } from "@web/lib/format";
import { usePaginatedQuery } from "convex/react";
import { useId, useState } from "react";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";
import { formatSetting } from "../lib/formatSetting";

const PAGE = 30;

function show(row: {
  targetKind: string;
  targetId: string;
  value: unknown;
}): string {
  if (row.targetKind === "setting" && row.targetId in SETTING_SPECS) {
    return formatSetting(SETTING_SPECS[row.targetId as SettingKey], row.value);
  }
  if (
    row.value !== null &&
    typeof row.value === "object" &&
    "phone" in row.value
  ) {
    return String((row.value as { phone: unknown }).phone);
  }
  return row.value === null ? t.settings.empty : JSON.stringify(row.value);
}

/** Every recorded change, newest first (spec 4.5). */
export function AuditPage() {
  const adminToken = useAdminToken() ?? "";
  const filterId = useId();
  const [action, setAction] = useState<AuditAction | "">("");
  const { results, status, loadMore } = usePaginatedQuery(
    api.audit.list,
    { adminToken, ...(action === "" ? {} : { action }) },
    { initialNumItems: PAGE },
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-green-deep">{t.audit.title}</h1>
      <label htmlFor={filterId} className="sr-only">
        {t.audit.filter}
      </label>
      <select
        id={filterId}
        value={action}
        onChange={(e) => setAction(e.target.value as AuditAction | "")}
        className="rounded-ui border-2 border-line bg-white p-3"
      >
        <option value="">{t.audit.all}</option>
        {(Object.keys(t.audit.actions) as AuditAction[]).map((a) => (
          <option key={a} value={a}>
            {t.audit.actions[a]}
          </option>
        ))}
      </select>
      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-ink-soft">{t.audit.empty}</p>
      )}
      <ul className="flex flex-col gap-2">
        {results.map((row) => (
          <li
            key={row._id}
            className="rounded-ui border-2 border-line bg-card px-4 py-3 text-sm"
          >
            <div className="flex justify-between gap-2 text-ink-soft">
              <span dir="ltr">{row.adminPhone ?? t.audit.system}</span>
              <span>{formatDate(row.at)}</span>
            </div>
            <p className="mt-1 font-medium">
              {t.audit.actions[row.action]}
              {row.targetKind === "setting" &&
                row.targetId in t.settings.labels &&
                `: ${t.settings.labels[row.targetId as SettingKey]}`}
            </p>
            <p className="mt-1">
              {t.audit.beforeAfter(
                show({ ...row, value: row.before }),
                show({ ...row, value: row.after }),
              )}
            </p>
            {row.note !== null && (
              <p className="mt-1 text-ink-soft">
                {t.audit.note}: {row.note}
              </p>
            )}
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <button
          type="button"
          className="font-medium text-green underline underline-offset-4"
          onClick={() => loadMore(PAGE)}
        >
          {t.audit.more}
        </button>
      )}
    </div>
  );
}
