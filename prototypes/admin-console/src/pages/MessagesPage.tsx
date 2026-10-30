import { RotateCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill } from "@/components/common";
import { DataTable, type Column, type Filter } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { ago, num } from "@/lib/format";
import { change, go, useCan, useDb } from "@/lib/store";
import type { WaMessage, WaStatus } from "@/lib/types";

function StatusPill({ status }: { status: WaStatus }) {
  if (status === "failed") return <Pill tone="bad">فشلت</Pill>;
  if (status === "skipped") return <Pill tone="warn">تُخطيت</Pill>;
  if (status === "read") return <Pill tone="good">قُرئت</Pill>;
  return <Pill tone="info">وصلت</Pill>;
}

export function MessagesPage() {
  const db = useDb();
  const can = useCan();
  const name = (m: WaMessage) => db.people.find((p) => p.id === m.personId)?.name ?? "حساب محذوف";
  const khatma = (m: WaMessage) => db.khatmas.find((k) => k.id === m.khatmaId)?.name ?? "—";
  const failed = db.messages.filter((m) => m.status === "failed").length;

  const retry = (message: WaMessage) => {
    change((d) => ({
      ...d,
      messages: d.messages.map((m) => (m.id === message.id ? { ...m, status: "delivered", reason: null, at: Date.now() } : m)),
    }));
    toast.success("أُعيد الإرسال");
  };

  const columns: Column<WaMessage>[] = [
    { key: "at", header: "الوقت", sort: (m) => m.at, cell: (m) => <span className="text-muted-foreground">{ago(m.at)}</span> },
    { key: "person", header: "الشخص", sort: name, cell: (m) => <span className="font-medium">{name(m)}</span> },
    { key: "template", header: "القالب", sort: (m) => m.template, cell: (m) => m.template },
    { key: "khatma", header: "الختمة", cell: khatma },
    { key: "status", header: "الحالة", sort: (m) => m.status, cell: (m) => <StatusPill status={m.status} /> },
    { key: "reason", header: "السبب", cell: (m) => <span className="text-muted-foreground">{m.reason ?? "—"}</span> },
    {
      key: "retry",
      header: "",
      cell: (m) =>
        m.status === "failed" && can("person.edit") ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              retry(m);
            }}
          >
            <RotateCw className="size-3" /> إعادة
          </Button>
        ) : null,
    },
  ];

  const filters: Filter<WaMessage>[] = [
    {
      key: "status",
      label: "الحالة",
      options: [
        { value: "failed", label: "فشلت", test: (m) => m.status === "failed" },
        { value: "skipped", label: "تُخطيت", test: (m) => m.status === "skipped" },
        { value: "delivered", label: "وصلت", test: (m) => m.status === "delivered" },
        { value: "read", label: "قُرئت", test: (m) => m.status === "read" },
      ],
    },
    {
      key: "template",
      label: "القالب",
      options: [...new Set(db.messages.map((m) => m.template))].map((template) => ({
        value: template,
        label: template,
        test: (m: WaMessage) => m.template === template,
      })),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        title="رسائل واتساب"
        description={`آخر ١٤ يوماً. ${num(failed)} رسالة فشلت، وسبب كل واحدة مكتوب بجانبها.`}
      />
      <DataTable
        rows={db.messages}
        columns={columns}
        rowKey={(m) => m.id}
        searchText={(m) => `${name(m)} ${m.template} ${m.reason ?? ""}`}
        searchPlaceholder="شخص أو قالب أو سبب"
        filters={filters}
        defaultSort={{ key: "at", desc: true }}
        onRowClick={(m) => go({ page: "person", id: m.personId })}
        card={(m) => (
          <span className="block">
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{name(m)}</span>
              <StatusPill status={m.status} />
            </span>
            <span className="mt-0.5 flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{m.reason ?? m.template}</span>
              <span className="shrink-0">{ago(m.at)}</span>
            </span>
          </span>
        )}
      />
    </div>
  );
}
