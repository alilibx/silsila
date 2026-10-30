import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { Field, PageHeader, Pill, ask } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { applySetting, isDefault, settingError } from "@/lib/actions";
import { num, settingText, timeText } from "@/lib/format";
import { fold } from "@/lib/search";
import settingsData from "@/lib/settings.generated.json";
import { go, useCan, useDb } from "@/lib/store";
import type { GraceMap, Setting, SettingGroup, SettingValue } from "@/lib/types";
import { cn } from "@/lib/utils";

const GROUPS = settingsData.groups as { key: SettingGroup; label: string; intro: string }[];
type Tab = SettingGroup | "changed";

const UNIT_MS = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
type Unit = keyof typeof UNIT_MS;
const UNITS: [Unit, string][] = [["seconds", "ثوانٍ"], ["minutes", "دقائق"], ["hours", "ساعات"], ["days", "أيام"]];
const GRACE_UNITS: [string, string][] = [["minutes", "دقائق"], ["hours", "ساعات"], ["days", "أيام"]];
const SCHEDULES: Record<string, string> = {
  daily: "يومية",
  every3days: "كل ٣ أيام",
  weekly: "أسبوعية",
  biweekly: "كل أسبوعين",
  monthly: "شهرية",
  none: "بدون موعد",
};
const TIME_STEPS = Array.from({ length: 96 }, (_, i) => i * 15);

function bestUnit(ms: number): Unit {
  for (const [unit] of [...UNITS].reverse()) if (ms !== 0 && ms % UNIT_MS[unit] === 0) return unit;
  return "seconds";
}

function parseNumber(text: string): number {
  const cleaned = fold(text.trim()).replace("٫", ".");
  return cleaned === "" ? Number.NaN : Number(cleaned);
}

function Editor({ setting, onDone }: { setting: Setting; onDone: () => void }) {
  const { spec, value } = setting;
  const startUnit = spec.kind === "duration" ? bestUnit(value as number) : "seconds";
  const [unit, setUnit] = useState<Unit>(startUnit);
  const [text, setText] = useState(() =>
    spec.kind === "duration" ? String((value as number) / UNIT_MS[startUnit]) : value === null ? "" : String(value),
  );
  const [grace, setGrace] = useState<GraceMap>(() => value as GraceMap);
  const [error, setError] = useState<string | null>(null);

  const next = (): SettingValue => {
    if (spec.kind === "duration") return Math.round(parseNumber(text) * UNIT_MS[unit]);
    if (spec.kind === "grace") return grace;
    if (spec.kind === "text" || spec.kind === "version") return text.trim() === "" ? null : text.trim();
    return parseNumber(text);
  };

  const save = () => {
    const candidate = next();
    const problem = settingError(setting, candidate);
    if (problem) {
      setError(problem);
      return;
    }
    applySetting(setting, candidate);
    onDone();
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {spec.kind === "grace" ? (
        Object.keys(grace).map((schedule) => (
          <Field key={schedule} label={SCHEDULES[schedule]}>
            <div className="flex gap-2">
              <Input
                id={`grace-${schedule}`}
                dir="ltr"
                inputMode="numeric"
                value={String(grace[schedule].value)}
                onChange={(e) => setGrace((g) => ({ ...g, [schedule]: { ...g[schedule], value: Number(e.target.value) || 0 } }))}
              />
              <Select
                dir="rtl"
                value={grace[schedule].unit}
                onValueChange={(u) => setGrace((g) => ({ ...g, [schedule]: { ...g[schedule], unit: u as "minutes" } }))}
              >
                <SelectTrigger className="w-28" aria-label="الوحدة">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRACE_UNITS.map(([u, label]) => (
                    <SelectItem key={u} value={u}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>
        ))
      ) : spec.kind === "text" ? (
        <Textarea id="setting-text" rows={3} maxLength={spec.maxLength} value={text} onChange={(e) => setText(e.target.value)} />
      ) : spec.kind === "time" ? (
        <Select dir="rtl" value={text} onValueChange={setText}>
          <SelectTrigger className="w-full" aria-label={setting.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_STEPS.map((minutes) => (
              <SelectItem key={minutes} value={String(minutes)}>
                {timeText(minutes)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-2">
          <Input id="setting-value" dir="ltr" inputMode={spec.kind === "version" ? "text" : "decimal"} value={text} onChange={(e) => setText(e.target.value)} />
          {spec.kind === "duration" && (
            <Select dir="rtl" value={unit} onValueChange={(u) => setUnit(u as Unit)}>
              <SelectTrigger className="w-28" aria-label="الوحدة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map(([u, label]) => (
                  <SelectItem key={u} value={u}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      )}
      <Button type="submit">حفظ</Button>
    </form>
  );
}

function SettingSheet({ setting, onClose }: { setting: Setting; onClose: () => void }) {
  const can = useCan();
  const mobile = useIsMobile();
  const { spec } = setting;
  const hasRange = spec.kind === "int" || spec.kind === "number" || spec.kind === "duration";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} className={cn("overflow-y-auto", mobile ? "max-h-[85svh]" : "w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>{setting.label}</SheetTitle>
          <SheetDescription>{setting.what}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-4">
          <div className="rounded-md bg-muted p-3 text-[13px]">
            <p className="mb-1 font-medium">لماذا هذا الافتراضي؟</p>
            <p>{setting.why}</p>
            <p className="mt-2 text-muted-foreground">الافتراضي: {settingText(spec, setting.defaultValue)}</p>
            {hasRange && (
              <p className="text-muted-foreground">
                المسموح من {settingText(spec, spec.min!)} إلى {settingText(spec, spec.max!)}
              </p>
            )}
          </div>
          {can("settings.edit") ? (
            <>
              <Editor setting={setting} onDone={onClose} />
              {!isDefault(setting) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    applySetting(setting, setting.defaultValue, "إعادة إعداد إلى الافتراضي");
                    onClose();
                  }}
                >
                  <RotateCcw /> إرجاع للافتراضي
                </Button>
              )}
            </>
          ) : (
            <p className="text-[13px]">
              القيمة الحالية: <span className="font-medium">{settingText(spec, setting.value)}</span>
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SettingRow({ setting, onOpen }: { setting: Setting; onOpen: () => void }) {
  const can = useCan();
  const [why, setWhy] = useState(false);
  const custom = !isDefault(setting) && <Pill tone="warn">معدّل</Pill>;

  if (setting.spec.kind === "bool") {
    const on = setting.value === true;
    const flip = (next: boolean) => {
      if (setting.key === "maintenanceMode" && next) {
        ask({
          title: "تشغيل وضع الصيانة؟",
          body: "يتوقف كل شيء في الموقع للجميع حتى تطفئه.",
          confirm: "تشغيل",
          destructive: true,
          onConfirm: () => applySetting(setting, next),
        });
      } else applySetting(setting, next);
    };
    return (
      <li className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
              {setting.label} {custom}
            </p>
            <p className="text-xs text-muted-foreground">{setting.what}</p>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {on ? "مفعّل" : "متوقف"}
            <Switch aria-label={setting.label} checked={on} disabled={!can("settings.edit")} onCheckedChange={flip} />
          </span>
        </div>
        <button type="button" className="mt-1 text-xs text-primary underline underline-offset-2" onClick={() => setWhy((w) => !w)}>
          لماذا هذا الافتراضي؟
        </button>
        {why && <p className="mt-1 text-xs text-muted-foreground">{setting.why}</p>}
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={onOpen} aria-label={`تعديل ${setting.label}`} className="flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-accent">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
            {setting.label} {custom}
          </span>
          <span className="block text-xs text-muted-foreground">{setting.what}</span>
        </span>
        <span className="flex max-w-[45%] shrink-0 items-center gap-1 text-end text-[13px] font-medium text-primary">
          <span className="line-clamp-2">{settingText(setting.spec, setting.value)}</span>
          <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
        </span>
      </button>
    </li>
  );
}

export function SettingsPage({ focusKey }: { focusKey?: string }) {
  const db = useDb();
  const can = useCan();
  const [tab, setTab] = useState<Tab>("switches");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Rows the "changed" tab listed stay until the tab changes, so a reset doesn't pull one away.
  const listed = useRef<Set<string>>(new Set());
  const words = fold(query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;

  useEffect(() => {
    const target = db.settings.find((s) => s.key === focusKey);
    if (target) {
      setTab(target.group);
      setOpenKey(target.spec.kind === "bool" ? null : target.key);
    }
  }, [focusKey]);

  const changedCount = db.settings.filter((s) => !isDefault(s)).length;
  const shown = useMemo(() => {
    if (searching) {
      return db.settings.filter((s) => {
        const hay = fold(`${s.label} ${s.what} ${s.why} ${s.key}`);
        return words.every((word) => hay.includes(word));
      });
    }
    if (tab === "changed") {
      db.settings.forEach((s) => !isDefault(s) && listed.current.add(s.key));
      return db.settings.filter((s) => listed.current.has(s.key));
    }
    return db.settings.filter((s) => s.group === tab);
  }, [db.settings, searching, query, tab]);

  const spansGroups = searching || tab === "changed";
  const open = db.settings.find((s) => s.key === openKey);

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader title="الإعدادات" description={`${num(db.settings.length)} إعداداً. تسري فوراً على الموقع، وكل تغيير يُسجَّل.`} />
      {!can("settings.edit") && (
        <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">دورك يقرأ الإعدادات ولا يغيّرها.</p>
      )}
      <div className="sticky top-14 z-10 -mx-1 grid grid-cols-1 gap-2 bg-background px-1 pb-2">
        <div className="relative md:max-w-sm">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="settings-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الوصف" className="h-9 ps-8" />
        </div>
        <div role="tablist" aria-label="مجموعات الإعدادات" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {[...GROUPS.map((g) => ({ key: g.key as Tab, label: g.label, count: db.settings.filter((s) => s.group === g.key).length })), { key: "changed" as Tab, label: "المعدّلة", count: changedCount }].map((item) => {
            const selected = !searching && tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setQuery("");
                  setTab(item.key);
                  listed.current = new Set();
                  go({ page: "settings" });
                }}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1 text-[13px] whitespace-nowrap",
                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
                )}
              >
                {item.label} <span className="opacity-70">{num(item.count)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!spansGroups && <p className="text-[13px] text-muted-foreground">{GROUPS.find((g) => g.key === tab)?.intro}</p>}
      {shown.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {searching ? "لا يوجد إعداد يطابق البحث." : "كل الإعدادات على قيمها الافتراضية."}
        </p>
      )}
      {GROUPS.filter((g) => shown.some((s) => s.group === g.key)).map((group) => {
        const rows = shown.filter((s) => s.group === group.key);
        const sections = [...new Set(rows.map((s) => s.sectionLabel))];
        return (
          <section key={group.key} className="grid grid-cols-1 gap-3">
            {spansGroups && <h2 className="text-sm font-semibold">{group.label}</h2>}
            {sections.map((section) => (
              <div key={section} className="grid grid-cols-1 gap-1.5">
                {sections.length > 1 && <h3 className="text-xs font-medium text-muted-foreground">{section}</h3>}
                <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                  {rows
                    .filter((s) => s.sectionLabel === section)
                    .map((setting) => (
                      <SettingRow key={setting.key} setting={setting} onOpen={() => setOpenKey(setting.key)} />
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      {open && <SettingSheet key={open.key} setting={open} onClose={() => setOpenKey(null)} />}
    </div>
  );
}
