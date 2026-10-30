// Copies the real settings into the prototype, so its list can't drift from the panel's.
import { writeFileSync } from "node:fs";
import { SETTING_DEFAULTS } from "../../../convex/lib/settings";
import { SETTING_SPECS } from "../../../convex/lib/settingSpecs";
import { t } from "../../../apps/admin/src/i18n/ar";
import { SETTING_LAYOUT } from "../../../apps/admin/src/lib/settingLayout";

const ORDER = ["switches", "pace", "notifications", "help", "limits", "sessions", "rota"] as const;

const rows = ORDER.flatMap((group) =>
  SETTING_LAYOUT[group].flatMap(({ section, keys }) =>
    keys.map((key) => ({
      key,
      group,
      section,
      sectionLabel: t.settings.sections[section],
      label: t.settings.labels[key],
      what: t.settings.help[key].what,
      why: t.settings.help[key].why,
      spec: SETTING_SPECS[key],
      value: SETTING_DEFAULTS[key],
      defaultValue: SETTING_DEFAULTS[key],
    })),
  ),
);
const groups = ORDER.map((key) => ({ key, label: t.settings.groups[key], intro: t.settings.groupIntros[key] }));

writeFileSync(new URL("../src/lib/settings.generated.json", import.meta.url), JSON.stringify({ groups, rows }, null, 1));
console.log(rows.length, "settings of", Object.keys(SETTING_DEFAULTS).length);
