import { api } from "@convex/_generated/api";
import { normalizeDigits } from "@convex/lib/digits";
import type { Grace } from "@convex/lib/grace";
import { SCHEDULES, type Schedule } from "@convex/lib/schedule";
import type { SettingSpec } from "@convex/lib/settingSpecs";
import type { SettingKey } from "@convex/lib/settings";
import { Button } from "@web/components/Button";
import { GraceField } from "@web/components/GraceField";
import { Sheet } from "@web/components/Sheet";
import { SwitchRow } from "@web/components/SwitchRow";
import { t as webT } from "@web/i18n/ar";
import { useMutation } from "convex/react";
import { useId, useState } from "react";
import { t } from "../i18n/ar";
import { useAdminToken } from "../lib/adminSession";
import { formatSetting } from "../lib/formatSetting";

export type SettingRow = {
  key: SettingKey;
  value: unknown;
  defaultValue: unknown;
  isDefault: boolean;
  spec: SettingSpec;
};

const UNIT_MS = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;
type Unit = keyof typeof UNIT_MS;
const UNITS: Unit[] = ["seconds", "minutes", "hours", "days"];

/** The largest unit that divides `ms` whole (seconds at least). */
function bestUnit(ms: number): Unit {
  for (const unit of [...UNITS].reverse()) {
    if (ms !== 0 && ms % UNIT_MS[unit] === 0) return unit;
  }
  return "seconds";
}

function parseNumber(text: string): number {
  const cleaned = normalizeDigits(text.trim()).replace("٫", ".");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

function errorText(code: string): string {
  const known: Record<string, string> = t.settings.errors;
  return known[code] ?? t.settings.errors.generic;
}

/** One setting: its value, default and range, with an editor sheet (spec 9.1). */
export function SettingField({ setting }: { setting: SettingRow }) {
  const adminToken = useAdminToken() ?? "";
  const set = useMutation(api.adminSettings.set);
  const reset = useMutation(api.adminSettings.reset);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = t.settings.labels[setting.key];
  const { spec } = setting;

  async function run(call: () => Promise<{ ok: true } | { error: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await call();
      if ("error" in res) setError(errorText(res.error));
      else setOpen(false);
    } catch {
      setError(errorText("generic"));
    } finally {
      setBusy(false);
    }
  }

  const save = (value: unknown) =>
    run(() => set({ adminToken, key: setting.key, value }));

  if (spec.kind === "bool") {
    return (
      <div>
        <SwitchRow
          label={label}
          on={setting.value === true}
          disabled={busy}
          onChange={(on) => void save(on)}
        />
        {error !== null && (
          <p role="alert" className="mt-1 text-sm text-saffron-ink">
            {error}
          </p>
        )}
      </div>
    );
  }

  const range =
    spec.kind === "int" || spec.kind === "number" || spec.kind === "duration"
      ? t.settings.range(
          formatSetting(spec, spec.min),
          formatSetting(spec, spec.max),
        )
      : null;

  return (
    <div className="flex items-start justify-between gap-3 rounded-ui border-2 border-line bg-card px-4 py-3">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        <span className="text-lg text-green-deep">
          {formatSetting(spec, setting.value)}
        </span>
        <span className="text-xs text-ink-soft">
          {t.settings.defaultValue}: {formatSetting(spec, setting.defaultValue)}
          {!setting.isDefault && ` · ${t.settings.custom}`}
        </span>
        {range !== null && (
          <span className="text-xs text-ink-soft">{range}</span>
        )}
      </div>
      <button
        type="button"
        aria-label={`${t.settings.edit} ${label}`}
        className="shrink-0 font-medium text-green underline underline-offset-4"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t.settings.edit}
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <Editor
            setting={setting}
            label={label}
            busy={busy}
            onSave={(value) => void save(value)}
          />
          {error !== null && (
            <p role="alert" className="mt-3 text-center text-saffron-ink">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2">
            {!setting.isDefault && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(() => reset({ adminToken, key: setting.key }))
                }
              >
                {t.settings.reset}
              </Button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Editor({
  setting,
  label,
  busy,
  onSave,
}: {
  setting: SettingRow;
  label: string;
  busy: boolean;
  onSave: (value: unknown) => void;
}) {
  const { spec, value } = setting;
  const inputId = useId();
  const unitId = useId();
  const initialUnit =
    spec.kind === "duration" && typeof value === "number"
      ? bestUnit(value)
      : "seconds";
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const [text, setText] = useState(() => {
    if (spec.kind === "duration" && typeof value === "number") {
      return String(value / UNIT_MS[initialUnit]);
    }
    return value === null || value === undefined ? "" : String(value);
  });
  const [grace, setGrace] = useState<Record<Schedule, Grace>>(
    () => value as Record<Schedule, Grace>,
  );

  function submit() {
    switch (spec.kind) {
      case "duration":
        return onSave(Math.round(parseNumber(text) * UNIT_MS[unit]));
      case "int":
      case "number":
      case "hour":
        return onSave(parseNumber(text));
      case "grace":
        return onSave(grace);
      default:
        return onSave(text);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {spec.kind === "grace" ? (
        SCHEDULES.map((schedule) => (
          <div key={schedule}>
            <p className="font-medium">{webT.schedules[schedule]}</p>
            <GraceField
              value={grace[schedule]}
              schedule={schedule}
              onChange={(g) => setGrace((prev) => ({ ...prev, [schedule]: g }))}
            />
          </div>
        ))
      ) : (
        <div className="flex gap-2">
          <label htmlFor={inputId} className="sr-only">
            {label}
          </label>
          {spec.kind === "text" ? (
            <textarea
              id={inputId}
              value={text}
              maxLength={spec.maxLength}
              rows={3}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-ui border-2 border-line bg-white p-3"
            />
          ) : (
            <input
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              inputMode={spec.kind === "version" ? "text" : "decimal"}
              dir="ltr"
              className="w-full rounded-ui border-2 border-line bg-white p-3 text-center text-lg"
            />
          )}
          {spec.kind === "duration" && (
            <>
              <label htmlFor={unitId} className="sr-only">
                {t.settings.unit}
              </label>
              <select
                id={unitId}
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="rounded-ui border-2 border-line bg-white p-3"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t.settings.units[u]}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
      <Button type="submit" disabled={busy}>
        {t.settings.save}
      </Button>
    </form>
  );
}
