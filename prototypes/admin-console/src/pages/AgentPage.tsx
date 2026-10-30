import { useState } from "react";
import { Bot, ExternalLink, ShieldAlert, Sparkles, Unplug } from "lucide-react";
import { toast } from "sonner";
import { CopyButton, Empty, PageHeader, Pill, ask } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACTIONS } from "@/lib/actions";
import { PANEL_ONLY, READ_TOOLS } from "@/lib/agent";
import { ago, dateTime } from "@/lib/format";
import { change, go, openAgent, useCan, useDb } from "@/lib/store";

const MCP_URL = "https://admin.wirdak.app/mcp";
const HOUR = 3_600_000;

type Connection = { id: string; client: string; admin: string; lastUsed: number };

const SEED_CONNECTIONS: Connection[] = [
  { id: "c1", client: "Claude · تطبيق سطح المكتب", admin: "علي الهاشمي", lastUsed: Date.now() - 2 * HOUR },
  { id: "c2", client: "Claude Code", admin: "علي الهاشمي", lastUsed: Date.now() - 30 * HOUR },
];

function ToolRow({ name, label, what, tier, audited }: { name: string; label: string; what: string; tier: "read" | "approve"; audited?: boolean }) {
  const db = useDb();
  const can = useCan();
  const off = db.disabledTools.includes(name);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
      <span className="min-w-0 grow basis-56">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          {label}
          {tier === "read" ? <Pill tone="good">قراءة</Pill> : <Pill tone="warn">بموافقتك</Pill>}
          {audited && <Pill tone="info">يُسجَّل</Pill>}
        </span>
        <span className="block text-xs text-muted-foreground">{what}</span>
      </span>
      <code className="ltr-text text-[11px] text-muted-foreground">{name}</code>
      <Switch
        aria-label={label}
        checked={!off}
        disabled={!can("team.manage")}
        onCheckedChange={(on) =>
          change(
            (d) => ({ ...d, disabledTools: on ? d.disabledTools.filter((t) => t !== name) : [...d.disabledTools, name] }),
            { action: on ? "تفعيل أداة للمساعد" : "إيقاف أداة للمساعد", targetKind: "admin", targetId: name, targetLabel: label, before: null, after: null, note: null },
          )
        }
      />
    </li>
  );
}

export function AgentPage() {
  const db = useDb();
  const can = useCan();
  const [connections, setConnections] = useState(SEED_CONNECTIONS);
  const activity = db.audit.filter((a) => a.via);

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        title="المساعد وClaude"
        description="أدوات واحدة تعمل من المحادثة هنا ومن Claude، بصلاحيات المشرف نفسها."
        actions={
          <Button size="sm" onClick={() => openAgent()}>
            <Sparkles /> افتح المساعد
          </Button>
        }
      />
      <Tabs dir="rtl" defaultValue="connect">
        <TabsList>
          <TabsTrigger value="connect">ربط Claude</TabsTrigger>
          <TabsTrigger value="tools">الأدوات</TabsTrigger>
          <TabsTrigger value="activity">النشاط</TabsTrigger>
        </TabsList>

        <TabsContent value="connect" className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-medium">
              <Bot className="size-4" /> أدر وِردك من Claude
            </h2>
            <p className="mt-1 rounded-md bg-saffron-soft px-2.5 py-1.5 text-xs text-saffron-ink">
              معاينة: هذا الخادم لم يُبنَ بعد، والرابط أدناه لا يعمل.
            </p>
            <ol className="mt-3 grid list-inside list-decimal gap-1.5 text-[13px]">
              <li>افتح Claude، ثم الإعدادات، ثم الموصلات.</li>
              <li>اختر إضافة موصل مخصص، والصق هذا الرابط:</li>
            </ol>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border bg-muted px-2.5 py-1.5">
              <code className="ltr-text truncate text-xs">{MCP_URL}</code>
              <CopyButton value={MCP_URL} label="نسخ الرابط" />
            </div>
            <ol start={3} className="mt-2 grid list-inside list-decimal gap-1.5 text-[13px]">
              <li>سجّل الدخول برقمك عبر واتساب، كما تدخل هذه اللوحة.</li>
              <li>وافق على الوصول. يعمل Claude بدورك أنت، ولا يتجاوزه.</li>
            </ol>
          </section>

          <section className="rounded-lg border bg-card">
            <h2 className="border-b px-3 py-2.5 text-[13px] font-medium">الاتصالات</h2>
            <ul className="divide-y text-[13px]">
              {connections.length === 0 && <Empty title="لا يوجد اتصال" />}
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{connection.client}</span>
                    <span className="block text-xs text-muted-foreground">
                      {connection.admin} · استُخدم {ago(connection.lastUsed)}
                    </span>
                  </span>
                  {can("team.manage") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      onClick={() =>
                        ask({
                          title: `قطع اتصال ${connection.client}؟`,
                          body: "يتوقف فوراً، ويحتاج تسجيل دخول جديداً.",
                          confirm: "قطع الاتصال",
                          destructive: true,
                          onConfirm: () => {
                            setConnections((list) => list.filter((c) => c.id !== connection.id));
                            change((d) => d, { action: "قطع اتصال Claude", targetKind: "admin", targetId: connection.id, targetLabel: connection.client, before: null, after: null, note: null });
                            toast.success("قُطع الاتصال");
                          },
                        })
                      }
                    >
                      <Unplug className="size-3.5" /> قطع
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border bg-card p-4 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-[13px] font-medium">
              <ShieldAlert className="size-4" /> قواعد الأمان
            </h2>
            <ul className="mt-2 grid gap-1.5 text-[13px] text-muted-foreground">
              <li>يعمل المساعد وClaude بدور المشرف المتصل، وتُفحص الصلاحية في الخادم مع كل أداة.</li>
              <li>لا يتغير شيء قبل موافقتك على بطاقة التأكيد، وكل تغيير يُسجَّل باسمك مع مصدره.</li>
              <li>ما يكتبه الأعضاء بيانات لا أوامر. رسالة مساعدة لا تستطيع تشغيل أداة.</li>
              <li>الحذف النهائي والتصدير وإدارة المشرفين تبقى في اللوحة ولا تُعطى لأي مساعد.</li>
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="tools" className="mt-3 grid grid-cols-1 gap-3">
          <ul className="divide-y rounded-lg border bg-card">
            {READ_TOOLS.map((tool) => (
              <ToolRow key={tool.name} {...tool} tier="read" />
            ))}
            {Object.entries(ACTIONS).map(([name, action]) => (
              <ToolRow key={name} name={name} label={action.label} what={action.what} tier="approve" />
            ))}
          </ul>
          <section className="rounded-lg border bg-card p-3 text-[13px]">
            <h2 className="font-medium">في اللوحة فقط</h2>
            <p className="mt-1 text-muted-foreground">{PANEL_ONLY.join("، ")}.</p>
          </section>
        </TabsContent>

        <TabsContent value="activity" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {activity.length === 0 && <Empty title="لا نشاط بعد" hint="ما ينفذه المساعد أو Claude يظهر هنا." />}
            {activity.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => go({ page: "audit", id: row.id })} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-accent">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                      {row.action} <Pill tone="info">{row.via === "agent" ? "المساعد" : "Claude"}</Pill>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.actor} · {row.targetLabel} · {dateTime(row.at)}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
