import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ChevronDown,
  Crown,
  Link2,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { CopyButton, DetailList, Empty, Field, PageHeader, PersonAvatar, Pill, ask } from "@/components/common";
import { DataTable, type Column, type Filter } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ago, date, dateTime, num } from "@/lib/format";
import { RotaCreateDialog, RotaTabs } from "./RotaPanels";
import { doneCount, setPaused } from "@/lib/rota";
import { change, go, useCan, useCanPage, useDb, usePhone } from "@/lib/store";
import type { Db, Khatma, KhatmaKind, KhatmaStatus, RotaState } from "@/lib/types";

const POOL_SCHEDULES = ["يومية", "كل ٣ أيام", "أسبوعية", "شهرية", "بدون موعد"];

function patchKhatma(db: Db, id: string, patch: Partial<Khatma>): Db {
  return { ...db, khatmas: db.khatmas.map((k) => (k.id === id ? { ...k, ...patch } : k)) };
}

function newCode() {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
}

function StatusPill({ status }: { status: KhatmaStatus }) {
  if (status === "archived") return <Pill>مؤرشفة</Pill>;
  if (status === "paused") return <Pill tone="warn">موقوفة</Pill>;
  return <Pill tone="good">نشطة</Pill>;
}

function KindPill({ kind }: { kind: KhatmaKind }) {
  return kind === "rota" ? <Pill tone="info">بالتناوب</Pill> : <Pill>بالحجز</Pill>;
}

function activeCount(k: Khatma) {
  return k.rota ? k.rota.participants.length : k.members.filter((m) => m.status === "active").length;
}

export function KhatmaForm({
  khatma,
  open,
  onOpenChange,
}: {
  khatma: Khatma | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const db = useDb();
  const phone = usePhone();
  const [name, setName] = useState(khatma?.name ?? "");
  const kind: KhatmaKind = khatma?.kind ?? "pool";
  const [schedule, setSchedule] = useState(khatma?.schedule ?? "أسبوعية");
  const [organizer, setOrganizer] = useState(khatma?.organizerId ?? "");
  const [find, setFind] = useState("");
  const matches = find
    ? db.people.filter((p) => p.status === "active" && (p.name.includes(find) || p.phone.includes(find))).slice(0, 5)
    : [];
  const picked = db.people.find((p) => p.id === organizer);
  const valid = name.trim().length > 1 && (khatma !== null || picked !== undefined);

  const save = () => {
    if (khatma) {
      change((d) => patchKhatma(d, khatma.id, { name: name.trim(), schedule }), {
        action: "تعديل ختمة",
        targetKind: "khatma",
        targetId: khatma.id,
        targetLabel: name.trim(),
        before: `${khatma.name} · ${khatma.schedule}`,
        after: `${name.trim()} · ${schedule}`,
        note: null,
      });
      toast.success("حُفظ التعديل");
    } else if (picked) {
      const id = `k${Date.now()}`;
      const created: Khatma = {
        id,
        name: name.trim(),
        kind,
        status: "active",
        organizerId: picked.id,
        inviteCode: newCode(),
        schedule: kind === "rota" ? "يومية · ٣٠ جزءاً" : schedule,
        completed: 0,
        createdAt: Date.now(),
        members: [{ personId: picked.id, status: "active", joinedAt: Date.now() }],
      };
      change((d) => ({ ...d, khatmas: [created, ...d.khatmas] }), {
        action: "إنشاء ختمة",
        targetKind: "khatma",
        targetId: id,
        targetLabel: created.name,
        before: null,
        after: `المنظّم: ${picked.name}`,
        note: null,
      });
      toast.success("أُنشئت الختمة");
      go({ page: "khatma", id });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{khatma ? "تعديل الختمة" : "ختمة جديدة"}</DialogTitle>
          <DialogDescription>{khatma ? "يرى الأعضاء الاسم الجديد فوراً." : "تُنشأ باسم المنظّم، ويصله رابطها على واتساب."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="الاسم">
            <Input id="khatma-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {!khatma && (
            <>
              <Field label="المنظّم">
                {picked ? (
                  <div className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[13px]">
                    {picked.name}
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOrganizer("")}>
                      تغيير
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input id="khatma-organizer" placeholder="ابحث باسم أو رقم" value={find} onChange={(e) => setFind(e.target.value)} />
                    {matches.length > 0 && (
                      <ul className="divide-y rounded-md border text-[13px]">
                        {matches.map((p) => (
                          <li key={p.id}>
                            <button type="button" className="flex w-full justify-between gap-2 px-2.5 py-1.5 text-start hover:bg-accent" onClick={() => setOrganizer(p.id)}>
                              {p.name}
                              <span className="ltr-text text-xs text-muted-foreground">{phone(p.phone)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Field>
            </>
          )}
          {(khatma ? khatma.kind === "pool" : kind === "pool") && (
            <Field label="الجدول">
              <Select dir="rtl" value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POOL_SCHEDULES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button disabled={!valid} onClick={save}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandOverDialog({ khatma, onClose }: { khatma: Khatma; onClose: () => void }) {
  const db = useDb();
  const [to, setTo] = useState("");
  const candidates = khatma.members
    .filter((m) => m.status === "active" && m.personId !== khatma.organizerId)
    .map((m) => db.people.find((p) => p.id === m.personId))
    .filter((p) => p !== undefined);
  const current = db.people.find((p) => p.id === khatma.organizerId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسليم المنظّم</DialogTitle>
          <DialogDescription>يصل المنظّم الجديد إشعار، ويبقى {current?.name ?? "المنظّم الحالي"} عضواً عادياً.</DialogDescription>
        </DialogHeader>
        <Field label="المنظّم الجديد">
          <Select dir="rtl" value={to} onValueChange={setTo}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر عضواً" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            disabled={!to}
            onClick={() => {
              const next = db.people.find((p) => p.id === to);
              change((d) => patchKhatma(d, khatma.id, { organizerId: to }), {
                action: "تسليم المنظّم",
                targetKind: "khatma",
                targetId: khatma.id,
                targetLabel: khatma.name,
                before: current?.name ?? null,
                after: next?.name ?? null,
                note: null,
              });
              toast.success("سُلّمت الختمة");
              onClose();
            }}
          >
            تسليم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function setStatus(khatma: Khatma, status: KhatmaStatus, action: string) {
  const previous = khatma.status;
  change((d) => patchKhatma(d, khatma.id, { status }), {
    action,
    targetKind: "khatma",
    targetId: khatma.id,
    targetLabel: khatma.name,
    before: previous,
    after: status,
    note: null,
  });
  toast.success(action, {
    action: { label: "تراجع", onClick: () => change((d) => patchKhatma(d, khatma.id, { status: previous })) },
  });
}

export function KhatmasPage() {
  const db = useDb();
  const can = useCan();
  const [creating, setCreating] = useState(false);
  const [creatingRota, setCreatingRota] = useState(false);
  const organizerName = (k: Khatma) => db.people.find((p) => p.id === k.organizerId)?.name ?? "—";

  const columns: Column<Khatma>[] = [
    { key: "name", header: "الختمة", sort: (k) => k.name, cell: (k) => <span className="font-medium">{k.name}</span> },
    { key: "kind", header: "النوع", sort: (k) => k.kind, cell: (k) => <KindPill kind={k.kind} /> },
    { key: "status", header: "الحالة", sort: (k) => k.status, cell: (k) => <StatusPill status={k.status} /> },
    { key: "organizer", header: "المنظّم", sort: organizerName, cell: organizerName },
    { key: "members", header: "الأعضاء", sort: activeCount, cell: (k) => <span className="tabular">{num(activeCount(k))}</span> },
    { key: "today", header: "اليوم", cell: (k) => (k.rota ? <span className="tabular">{num(doneCount(k.rota))} / {num(30)}</span> : <span className="text-muted-foreground">—</span>) },
    { key: "completed", header: "اكتملت", sort: (k) => k.completed, cell: (k) => <span className="tabular">{num(k.completed)}</span> },
    { key: "created", header: "أُنشئت", sort: (k) => k.createdAt, cell: (k) => <span className="text-muted-foreground">{date(k.createdAt)}</span> },
  ];

  const filters: Filter<Khatma>[] = [
    {
      key: "kind",
      label: "النوع",
      options: [
        { value: "pool", label: "بالحجز", test: (k) => k.kind === "pool" },
        { value: "rota", label: "بالتناوب", test: (k) => k.kind === "rota" },
      ],
    },
    {
      key: "requests",
      label: "الطلبات",
      options: [{ value: "join", label: "فيها طلبات انضمام", test: (k) => (k.rota?.joinRequests.length ?? 0) > 0 }],
    },
    {
      key: "status",
      label: "الحالة",
      options: [
        { value: "active", label: "نشطة", test: (k) => k.status === "active" },
        { value: "paused", label: "موقوفة", test: (k) => k.status === "paused" },
        { value: "archived", label: "مؤرشفة", test: (k) => k.status === "archived" },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        title="الختمات"
        description={`${num(db.khatmas.length)} ختمة، البالحجز والبالتناوب في مكان واحد.`}
        actions={
          can("khatma.edit") && (
            <>
              <Button size="sm" variant="outline" onClick={() => setCreatingRota(true)}>
                <Plus /> ختمة بالتناوب لمنظّم
              </Button>
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> ختمة بالحجز
              </Button>
            </>
          )
        }
      />
      <DataTable
        rows={db.khatmas}
        columns={columns}
        rowKey={(k) => k.id}
        searchText={(k) => `${k.name} ${k.inviteCode} ${organizerName(k)}`}
        searchPlaceholder="اسم أو منظّم أو رمز دعوة"
        filters={filters}
        defaultSort={{ key: "created", desc: true }}
        onRowClick={(k) => go({ page: "khatma", id: k.id })}
        card={(k) => (
          <span className="block">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium">{k.name}</span>
              <span className="ms-auto flex gap-1">
                <KindPill kind={k.kind} />
                <StatusPill status={k.status} />
              </span>
            </span>
            <span className="mt-0.5 flex justify-between text-xs text-muted-foreground">
              <span>{organizerName(k)}</span>
              <span>{k.rota ? `${num(doneCount(k.rota))} / ${num(30)} اليوم` : `${num(activeCount(k))} عضواً`}</span>
            </span>
          </span>
        )}
        bulk={
          can("khatma.edit")
            ? (ids, clear) => (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    ask({
                      title: `أرشفة ${num(ids.length)} ختمات؟`,
                      body: "تختفي من صفحات أعضائها وتتوقف إشعاراتها. يمكن استعادتها.",
                      confirm: "أرشفة",
                      onConfirm: () => {
                        db.khatmas.filter((k) => ids.includes(k.id)).forEach((k) => setStatus(k, "archived", "أرشفة ختمة"));
                        clear();
                      },
                    })
                  }
                >
                  <Archive /> أرشفة
                </Button>
              )
            : undefined
        }
      />
      {creating && <KhatmaForm khatma={null} open onOpenChange={setCreating} />}
      {creatingRota && <RotaCreateDialog onClose={() => setCreatingRota(false)} />}
    </div>
  );
}

export function KhatmaPage({ id }: { id: string }) {
  const db = useDb();
  const can = useCan();
  const phone = usePhone();
  const [editing, setEditing] = useState(false);
  const [handing, setHanding] = useState(false);
  const allowed = useCanPage();
  const khatma = db.khatmas.find((k) => k.id === id);

  if (!khatma) return <Empty title="هذه الختمة لم تعد موجودة" />;

  const organizer = db.people.find((p) => p.id === khatma.organizerId);
  const members = khatma.members
    .map((m) => ({ ...m, person: db.people.find((p) => p.id === m.personId) }))
    .filter((m) => m.person !== undefined);
  const audit = db.audit.filter((a) => a.targetId === id);
  const help = db.help.filter((h) => h.khatmaId === id);

  const setMember = (personId: string, status: "blocked" | "former" | "active", action: string, name: string) =>
    change(
      (d) =>
        patchKhatma(d, id, {
          members: khatma.members.map((m) => (m.personId === personId ? { ...m, status } : m)),
        }),
      { action, targetKind: "khatma", targetId: id, targetLabel: `${khatma.name} · ${name}`, before: null, after: status, note: null },
    );

  const detailsPanel = (
          <section className="rounded-lg border bg-card p-4">
            <DetailList
              rows={[
                ["رمز الدعوة", <span className="flex items-center gap-1" key="c"><span className="ltr-text font-medium">{khatma.inviteCode}</span><CopyButton value={khatma.inviteCode} label="نسخ الرمز" /></span>],
                ["الجدول", khatma.schedule],
                [khatma.kind === "rota" ? "دورات مكتملة" : "جولات مكتملة", num(khatma.completed)],
                ["أُنشئت", dateTime(khatma.createdAt)],
                ["طلبات مساعدة مرتبطة", num(help.length)],
                ["آخر ظهور للمنظّم", ago(organizer?.lastSeenAt ?? null)],
              ]}
            />
          </section>
  );
  const auditPanel = (
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {audit.length === 0 && <Empty title="لم يغيّر أحد شيئاً في هذه الختمة" />}
            {audit.map((a) => (
              <li key={a.id} className="px-3 py-2">
                <p className="font-medium">{a.action}</p>
                <p className="text-xs text-muted-foreground">
                  {a.actor} · {dateTime(a.at)}
                  {a.note ? ` · ${a.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <button type="button" onClick={() => go({ page: "khatmas" })} className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" /> الختمات
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {khatma.name} <KindPill kind={khatma.kind} /> <StatusPill status={khatma.status} />
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {khatma.schedule} · المنظّم: {organizer?.name ?? "—"}
          </p>
        </div>
        {can("khatma.edit") && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> تعديل
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHanding(true)}>
              <Crown /> تسليم المنظّم
            </Button>
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  المزيد <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onSelect={() =>
                    ask({
                      title: "إعادة ضبط رابط الدعوة؟",
                      body: "يتوقف الرابط الحالي فوراً. يحتفظ الأعضاء بمكانهم.",
                      confirm: "إعادة الضبط",
                      note: true,
                      onConfirm: (note) => {
                        const code = newCode();
                        change((d) => patchKhatma(d, id, { inviteCode: code }), {
                          action: "إعادة ضبط رابط الدعوة",
                          targetKind: "khatma",
                          targetId: id,
                          targetLabel: khatma.name,
                          before: khatma.inviteCode,
                          after: code,
                          note,
                        });
                        toast.success("صدر رابط جديد");
                      },
                    })
                  }
                >
                  <Link2 /> إعادة ضبط الرابط
                </DropdownMenuItem>
                {khatma.status === "active" && (
                  <DropdownMenuItem onSelect={() => (khatma.rota ? setPaused(id, true) : setStatus(khatma, "paused", "إيقاف ختمة مؤقتاً"))}>
                    <Pause /> إيقاف مؤقت
                  </DropdownMenuItem>
                )}
                {khatma.status === "paused" && (
                  <DropdownMenuItem onSelect={() => (khatma.rota ? setPaused(id, false) : setStatus(khatma, "active", "استئناف ختمة"))}>
                    <Play /> استئناف
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {khatma.status === "archived" ? (
                  <DropdownMenuItem onSelect={() => setStatus(khatma, "active", "استعادة ختمة")}>
                    <ArchiveRestore /> استعادة
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setStatus(khatma, "archived", "أرشفة ختمة")}>
                    <Archive /> أرشفة
                  </DropdownMenuItem>
                )}
                {can("khatma.delete") && (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      ask({
                        title: `حذف «${khatma.name}» نهائياً؟`,
                        body: `تُحذف الختمة وجولاتها لدى ${num(activeCount(khatma))} عضواً. الأرشفة تكفي في أغلب الحالات.`,
                        confirm: "حذف نهائياً",
                        destructive: true,
                        typeToConfirm: "حذف",
                        note: true,
                        onConfirm: (note) => {
                          change((d) => ({ ...d, khatmas: d.khatmas.filter((k) => k.id !== id) }), {
                            action: "حذف ختمة",
                            targetKind: "khatma",
                            targetId: id,
                            targetLabel: khatma.name,
                            before: `${num(activeCount(khatma))} عضواً`,
                            after: null,
                            note,
                          });
                          toast.success("حُذفت الختمة");
                          go({ page: "khatmas" });
                        },
                      })
                    }
                  >
                    <Trash2 /> حذف الختمة
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      {khatma.rota ? (
        <RotaTabs khatma={khatma as Khatma & { rota: RotaState }} details={detailsPanel} auditCount={audit.length} audit={auditPanel} />
      ) : (
      <Tabs dir="rtl" defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">الأعضاء ({num(activeCount(khatma))})</TabsTrigger>
          <TabsTrigger value="details">التفاصيل</TabsTrigger>
          {allowed("audit") && <TabsTrigger value="audit">السجل ({num(audit.length)})</TabsTrigger>}
        </TabsList>

        <TabsContent value="members" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {members.map((m) => {
              const person = m.person!;
              const isOrganizer = person.id === khatma.organizerId;
              return (
                <li key={person.id} className="flex items-center gap-2.5 px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-start" onClick={() => go({ page: "person", id: person.id })}>
                    <PersonAvatar name={person.name} className="size-7" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{person.name}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="ltr-text">{phone(person.phone)}</span>
                        {m.phoneHidden && <span>· مخفي عن المنظّم</span>}
                      </span>
                    </span>
                  </button>
                  {isOrganizer && <Pill tone="info">منظّم</Pill>}
                  {m.status === "blocked" && <Pill tone="bad">محظور</Pill>}
                  {m.status === "former" && <Pill>غادر</Pill>}
                  {can("khatma.edit") && !isOrganizer && m.status === "active" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      aria-label={`إزالة ${person.name}`}
                      onClick={() =>
                        ask({
                          title: `إزالة ${person.name} من الختمة؟`,
                          body: "تعود أجزاؤه المفتوحة متاحة للجميع.",
                          confirm: "إزالة",
                          destructive: true,
                          onConfirm: () => setMember(person.id, "former", "إزالة عضو", person.name),
                        })
                      }
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  )}
                  {can("khatma.edit") && m.status === "blocked" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setMember(person.id, "former", "رفع حظر عضو", person.name)}>
                      رفع الحظر
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </TabsContent>

        <TabsContent value="details" className="mt-3">
            {detailsPanel}
        </TabsContent>

        <TabsContent value="audit" className="mt-3">
            {auditPanel}
        </TabsContent>
      </Tabs>
      )}

      {editing && <KhatmaForm khatma={khatma} open onOpenChange={setEditing} />}
      {handing && <HandOverDialog khatma={khatma} onClose={() => setHanding(false)} />}
    </div>
  );
}
