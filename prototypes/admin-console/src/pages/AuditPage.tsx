import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DetailList, PageHeader, Pill } from "@/components/common";
import { DataTable, type Column, type Filter } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ago, dateTime, num } from "@/lib/format";
import { go, useDb } from "@/lib/store";
import type { AuditEntry, Route } from "@/lib/types";

const KINDS: Record<AuditEntry["targetKind"], string> = {
  person: "شخص",
  phone: "رقم",
  khatma: "ختمة",
  help: "مساعدة",
  setting: "إعداد",
  admin: "مشرف",
};

function targetRoute(row: AuditEntry): Route | null {
  if (row.targetKind === "person" || row.targetKind === "phone") return row.targetId === "all" ? null : { page: "person", id: row.targetId };
  if (row.targetKind === "khatma") return { page: "khatma", id: row.targetId };
  if (row.targetKind === "help") return { page: "help", id: row.targetId };
  if (row.targetKind === "setting") return { page: "settings", key: row.targetId };
  return { page: "team" };
}

export function AuditPage({ id }: { id?: string }) {
  const db = useDb();
  const [open, setOpen] = useState<AuditEntry | null>(() => db.audit.find((a) => a.id === id) ?? null);

  const columns: Column<AuditEntry>[] = [
    { key: "at", header: "الوقت", sort: (a) => a.at, cell: (a) => <span className="text-muted-foreground">{dateTime(a.at)}</span> },
    { key: "actor", header: "المشرف", sort: (a) => a.actor, cell: (a) => <span className="font-medium">{a.actor}</span> },
    { key: "action", header: "الفعل", sort: (a) => a.action, cell: (a) => <span className="flex items-center gap-1.5">{a.action}{a.via && <Pill tone="info">{a.via === "agent" ? "المساعد" : "Claude"}</Pill>}</span> },
    { key: "target", header: "الهدف", cell: (a) => <span className="flex items-center gap-1.5"><Pill>{KINDS[a.targetKind]}</Pill> {a.targetLabel}</span> },
    {
      key: "diff",
      header: "التغيير",
      cell: (a) =>
        a.before || a.after ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="max-w-32 truncate">{a.before ?? "—"}</span>
            <ArrowLeft className="size-3 shrink-0" />
            <span className="max-w-32 truncate text-foreground">{a.after ?? "—"}</span>
          </span>
        ) : null,
    },
  ];

  const filters: Filter<AuditEntry>[] = [
    {
      key: "actor",
      label: "المشرف",
      options: [...new Set(db.audit.map((a) => a.actor))].map((actor) => ({
        value: actor,
        label: actor,
        test: (a: AuditEntry) => a.actor === actor,
      })),
    },
    {
      key: "via",
      label: "المصدر",
      options: [
        { value: "panel", label: "من اللوحة", test: (a) => !a.via },
        { value: "agent", label: "عبر المساعد", test: (a) => a.via === "agent" },
        { value: "mcp", label: "عبر Claude", test: (a) => a.via === "mcp" },
      ],
    },
    {
      key: "kind",
      label: "النوع",
      options: Object.entries(KINDS).map(([value, label]) => ({
        value,
        label,
        test: (a: AuditEntry) => a.targetKind === value,
      })),
    },
  ];

  const route = open && targetRoute(open);

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader title="سجل التغييرات" description={`${num(db.audit.length)} تغييراً. كل فعل في هذه اللوحة يظهر هنا، ولا يمكن تعديله.`} />
      <DataTable
        rows={db.audit}
        columns={columns}
        rowKey={(a) => a.id}
        searchText={(a) => `${a.actor} ${a.action} ${a.targetLabel} ${a.note ?? ""}`}
        searchPlaceholder="مشرف أو فعل أو هدف"
        filters={filters}
        defaultSort={{ key: "at", desc: true }}
        onRowClick={setOpen}
        card={(a) => (
          <span className="block">
            <span className="flex justify-between gap-2">
              <span className="truncate font-medium">{a.action}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(a.at)}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {a.actor} · {a.targetLabel}
            </span>
          </span>
        )}
      />
      <Sheet open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{open?.action}</SheetTitle>
            <SheetDescription>{open && dateTime(open.at)}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="grid gap-4 px-4">
              <DetailList
                rows={[
                  ["المشرف", open.via ? `${open.actor} عبر ${open.via === "agent" ? "المساعد" : "Claude"}` : open.actor],
                  ["الهدف", `${KINDS[open.targetKind]} · ${open.targetLabel}`],
                  ["قبل", open.before ?? "—"],
                  ["بعد", open.after ?? "—"],
                  ["السبب", open.note ?? "لم يُكتب سبب"],
                ]}
              />
              {route && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(null);
                    go(route);
                  }}
                >
                  <ExternalLink /> افتح الهدف
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
