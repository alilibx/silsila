import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, LifeBuoy, MessageCircleWarning, UserX } from "lucide-react";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ago, date, num } from "@/lib/format";
import { go, useCanPage, useDb } from "@/lib/store";
import type { DayStat, Route } from "@/lib/types";

const DAY = 86_400_000;

function Attention({
  icon: Icon,
  count,
  label,
  hint,
  route,
}: {
  icon: typeof LifeBuoy;
  count: number;
  label: string;
  hint: string;
  route: Route;
}) {
  const hot = count > 0;
  return (
    <button
      type="button"
      onClick={() => go(route)}
      className="flex items-start gap-3 rounded-lg border bg-card p-3 text-start transition-colors hover:bg-accent"
    >
      <span className={`rounded-md p-1.5 ${hot ? "bg-saffron-soft text-saffron-ink" : "bg-muted text-muted-foreground"}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">
          <span className="tabular text-base font-semibold">{num(count)}</span> {label}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

const METRICS = {
  ajza: "أجزاء مقروءة",
  members: "أعضاء جدد",
  khatmas: "ختمات جديدة",
} as const;

function Trend({ stats }: { stats: DayStat[] }) {
  const [metric, setMetric] = useState<keyof typeof METRICS>("ajza");
  const max = Math.max(...stats.map((s) => s[metric]), 1);
  const top = Math.ceil(max / 5) * 5;
  const total = stats.reduce((sum, s) => sum + s[metric], 0);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-medium">آخر ٣٠ يوماً</h2>
          <p className="tabular text-xl font-semibold">{num(total)}</p>
        </div>
        <Tabs dir="rtl" value={metric} onValueChange={(v) => setMetric(v as keyof typeof METRICS)}>
          <TabsList className="h-8">
            {Object.entries(METRICS).map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="relative mt-4 h-44 ps-8">
        {[1, 0.5, 0].map((share) => (
          <div
            key={share}
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ bottom: `${share * 100}%` }}
          >
            <span className="tabular absolute start-0 -translate-y-1/2 bg-card pe-1 text-[11px] text-muted-foreground">
              {num(Math.round(top * share))}
            </span>
          </div>
        ))}
        <div className="relative flex h-full items-end gap-0.5">
          {stats.map((s) => (
            <Tooltip key={s.day}>
              <TooltipTrigger asChild>
                <div className="group flex h-full min-w-0 flex-1 items-end">
                  <div
                    className="w-full rounded-t-[3px] bg-chart-1 opacity-85 transition-opacity group-hover:opacity-100"
                    style={{ height: `${Math.max((s[metric] / top) * 100, 1)}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {date(s.day)}: {num(s[metric])}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        مجاميع الموقع كله.
      </p>
    </section>
  );
}

export function OverviewPage() {
  const db = useDb();
  const allowed = useCanPage();
  const stats = useMemo(() => {
    const now = Date.now();
    const lastWeek = db.stats.slice(-7);
    const failed = db.messages.filter((m) => m.status === "failed" && now - m.at < DAY).length;
    const activePeople = db.people.filter((p) => p.lastSeenAt !== null && now - p.lastSeenAt < 7 * DAY).length;
    const quiet = db.khatmas.filter((k) => {
      const organizer = db.people.find((p) => p.id === k.organizerId);
      return k.status === "active" && (organizer?.lastSeenAt ?? 0) < now - 30 * DAY;
    }).length;
    return {
      open: db.help.filter((h) => h.status === "open").length,
      failed,
      quiet,
      blocked: db.people.filter((p) => p.status === "blocked").length,
      activePeople,
      activeKhatmas: db.khatmas.filter((k) => k.status === "active").length,
      weekAjza: lastWeek.reduce((sum, s) => sum + s.ajza, 0),
      completed: db.khatmas.reduce((sum, k) => sum + k.completed, 0),
    };
  }, [db]);

  const figures = [
    ["الأشخاص", db.people.length, `${num(stats.activePeople)} نشط هذا الأسبوع`],
    ["الختمات النشطة", stats.activeKhatmas, `من ${num(db.khatmas.length)} ختمة`],
    ["أجزاء هذا الأسبوع", stats.weekAjza, "مجموع كل الختمات"],
    ["ختمات مكتملة", stats.completed, "منذ الإطلاق"],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader title="نظرة عامة" description="ما يحتاج انتباهك اليوم، ثم صحة الخدمة." />

      <section aria-label="يحتاج انتباهك" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {allowed("help") && <Attention icon={LifeBuoy} count={stats.open} label="طلبات تنتظر الرد" hint="أقدمها أولاً" route={{ page: "help" }} />}
        {allowed("messages") && <Attention icon={MessageCircleWarning} count={stats.failed} label="رسائل فشلت اليوم" hint="آخر ٢٤ ساعة" route={{ page: "messages" }} />}
        <Attention icon={AlertTriangle} count={stats.quiet} label="ختمات منظّمها غائب" hint="غاب أكثر من ٣٠ يوماً" route={{ page: "khatmas" }} />
        <Attention icon={UserX} count={stats.blocked} label="أرقام محظورة" hint="راجعها دورياً" route={{ page: "people" }} />
      </section>

      <section aria-label="الأرقام" className="grid grid-cols-2 divide-x divide-x-reverse rounded-lg border bg-card xl:grid-cols-4 max-xl:[&>*:nth-child(-n+2)]:border-b">
        {figures.map(([label, value, hint]) => (
          <div key={label} className="p-3.5">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular text-2xl font-semibold">{num(value)}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Trend stats={db.stats} />
        {allowed("audit") && <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h2 className="text-[13px] font-medium">آخر التغييرات</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => go({ page: "audit" })}>
              السجل كله <ArrowLeft className="size-3.5" />
            </Button>
          </div>
          <ul className="divide-y">
            {db.audit.slice(0, 6).map((row) => (
              <li key={row.id} className="px-4 py-2 text-[13px]">
                <p className="truncate">
                  <span className="font-medium">{row.action}</span>
                  <span className="text-muted-foreground"> · {row.targetLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.actor} · {ago(row.at)}
                </p>
              </li>
            ))}
          </ul>
        </section>}
      </div>
    </div>
  );
}
