import { api } from "@convex/_generated/api";
import type { SettingGroup } from "@convex/lib/settingSpecs";
import { useQuery } from "convex/react";
import { SettingField } from "../components/SettingField";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";

const ORDER: SettingGroup[] = [
  "switches",
  "pace",
  "notifications",
  "help",
  "limits",
  "sessions",
];

/** Every setting, grouped (spec 9.1). */
export function SettingsPage() {
  const adminToken = useAdminToken() ?? "";
  const rows = useQuery(api.adminSettings.list, { adminToken });
  if (rows === undefined) return null;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl text-green-deep">
        {t.settings.title}
      </h1>
      {ORDER.map((group) => (
        <section key={group} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t.settings.groups[group]}</h2>
          {rows
            .filter((row) => row.spec.group === group)
            .map((row) => (
              <SettingField key={row.key} setting={row} />
            ))}
        </section>
      ))}
    </div>
  );
}
