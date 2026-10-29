import { api } from "@convex/_generated/api";
import { normalizeDigits } from "@convex/lib/digits";
import type { Grace } from "@convex/lib/grace";
import { SCHEDULES, type Schedule } from "@convex/lib/schedule";
import type { SettingSpec } from "@convex/lib/settingSpecs";
import type { SettingKey } from "@convex/lib/settings";
import { Button } from "@web/components/Button";
import { GraceField } from "@web/components/GraceField";
import { Sheet } from "@web/components/Sheet";
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

/**
 * One setting as a row: its name, what it does, and its value. Tapping it opens
 * a sheet that says why the default was chosen, with the editor (spec 9.1).
 * Switches flip in place.
 */
export function SettingField({ setting }: { setting: SettingRow }) {
  const adminToken = useAdminToken() ?? "";
  const set = useMutation(api.adminSettings.set);
  const reset = useMutation(api.adminSettings.reset);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = t.settings.labels[setting.key];
  const labelId = useId();
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

  const { what, why } = t.settings.help[setting.key];
  const changed = !setting.isDefault && (
    <span className="rounded-full bg-saffron-soft px-2 py-0.5 text-xs font-normal text-saffron-ink">
      {t.settings.custom}
    </span>
  );
  const range =
    spec.kind === "int" || spec.kind === "number" || spec.kind === "duration"
      ? t.settings.range(
          formatSetting(spec, spec.min),
          formatSetting(spec, spec.max),
        )
      : null;
  const reason = (
    <>
      <p>{why}</p>
      <p className="mt-2 text-ink-soft">
        {t.settings.defaultValue}: {formatSetting(spec, setting.defaultValue)}
      </p>
      {range !== null && <p className="text-ink-soft">{range}</p>}
    </>
  );
  const errorLine = (className: string) =>
    error !== null && (
      <p role="alert" className={className}>
        {error}
      </p>
    );

  if (spec.kind === "bool") {
    const on = setting.value === true;
    return (
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              id={labelId}
              className="flex flex-wrap items-center gap-2 font-medium"
            >
              {label}
              {changed}
            </span>
            <span className="text-sm text-ink-soft">{what}</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={labelId}
            disabled={busy}
            onClick={() => void save(!on)}
            className={`flex shrink-0 items-center gap-2 pt-0.5 disabled:opacity-50 ${on ? "text-green-deep" : "text-ink-soft"}`}
          >
            {on ? t.settings.on : t.settings.off}
            <span
              aria-hidden="true"
              className={`flex h-7 w-12 items-center rounded-full p-1 transition-colors ${on ? "bg-green" : "bg-line"}`}
            >
              <span
                className={`size-5 rounded-full bg-white transition-[margin] ${on ? "ms-auto" : "me-auto"}`}
              />
            </span>
          </button>
        </div>
        <details className="mt-1 text-sm">
          <summary className="cursor-pointer text-green underline underline-offset-4">
            {t.settings.whyDefault}
          </summary>
          <div className="mt-1">{reason}</div>
        </details>
        {errorLine("mt-1 text-sm text-saffron-ink")}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-label={`${t.settings.edit} ${label}`}
        className="flex w-full flex-col gap-0.5 px-4 py-3 text-start hover:bg-paper"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <span className="flex w-full items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 font-medium">
            {label}
            {changed}
          </span>
          <span className="flex max-w-[50%] shrink-0 items-start gap-2 text-end font-semibold text-green-deep">
            <span className="line-clamp-2">
              {formatSetting(spec, setting.value)}
            </span>
            <span aria-hidden="true" className="font-normal text-ink-soft">
              ‹
            </span>
          </span>
        </span>
        <span className="text-sm text-ink-soft">{what}</span>
      </button>
      {open && (
        <Sheet title={label} onClose={() => setOpen(false)}>
          <p>{what}</p>
          <div className="mt-3 rounded-ui bg-paper-2 p-3 text-sm">
            <p className="mb-1 font-semibold">{t.settings.whyDefault}</p>
            {reason}
          </div>
          <div className="mt-4">
            <Editor
              setting={setting}
              label={label}
              busy={busy}
              onSave={(value) => void save(value)}
            />
          </div>
          {errorLine("mt-3 text-center text-saffron-ink")}
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

/** Settings as one card, a line between rows. */
export function SettingList({ rows }: { rows: SettingRow[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-ui border-2 border-line bg-card">
      {rows.map((row) => (
        <SettingField key={row.key} setting={row} />
      ))}
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
