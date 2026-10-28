import { api } from "@convex/_generated/api";
import { toArabicDigits } from "@convex/lib/digits";
import { formatDate } from "@web/lib/format";
import { useQuery } from "convex/react";
import { Link } from "react-router";
import { AdminPushCard } from "../components/AdminPushCard";
import { SettingField } from "../components/SettingField";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

const QUICK = ["maintenanceMode", "maintenanceMessage", "announcement"];

/** Open help requests and how long the oldest has waited (spec 6.1, first block). */
function OpenHelpCard({ adminToken }: { adminToken: string }) {
  const counts = useQuery(api.adminHelp.counts, { adminToken });
  if (!counts || counts.open === 0) return null;
  return (
    <Link
      to="/help"
      className="flex items-center justify-between rounded-ui bg-saffron-soft px-4 py-3 text-saffron-ink"
    >
      <span>
        <span className="block font-semibold">{t.help.homeCard}</span>
        {counts.oldestOpenAt !== null && (
          <span className="text-sm">
            {t.help.oldest(formatDate(counts.oldestOpenAt))}
          </span>
        )}
      </span>
      <span className="rounded-full bg-saffron px-3 py-1 font-semibold text-white">
        {counts.open >= 100 ? t.help.manyOpen : toArabicDigits(counts.open)}
      </span>
    </Link>
  );
}

/** The front page. Until stats arrive (plan 3c), it holds help and the quick switches. */
export function HomePage() {
  const adminToken = useAdminToken() ?? "";
  const rows = useQuery(api.adminSettings.list, { adminToken });
  if (rows === undefined) return null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-green-deep">{t.home.title}</h1>
      <OpenHelpCard adminToken={adminToken} />
      <AdminPushCard />
      <h2 className="text-lg font-semibold">{t.home.switches}</h2>
      {rows
        .filter((row) => QUICK.includes(row.key))
        .map((row) => (
          <div key={row.key}>
            <SettingField setting={row} />
            <p className="mt-1 text-sm text-ink-soft">
              {row.key === "maintenanceMode"
                ? t.home.maintenanceHint
                : row.key === "announcement"
                  ? t.home.announcementHint
                  : null}
            </p>
          </div>
        ))}
    </div>
  );
}
