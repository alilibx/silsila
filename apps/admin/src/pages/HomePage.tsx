import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { SettingField } from "../components/SettingField";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

const QUICK = ["maintenanceMode", "maintenanceMessage", "announcement"];

/** The front page. Until stats arrive (plan 3c), it holds the quick switches. */
export function HomePage() {
  const adminToken = useAdminToken() ?? "";
  const rows = useQuery(api.adminSettings.list, { adminToken });
  if (rows === undefined) return null;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl text-green-deep">{t.home.title}</h1>
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
