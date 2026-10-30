import { useMemo, useState } from "react";
import {
  ArrowRight,
  Ban,
  ChevronDown,
  Download,
  LogOut,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ago, ar, date, dateTime, maskPhone, num } from "@/lib/format";
import { change, go, useCan, useCanPage, useDb, usePhone } from "@/lib/store";
import type { Db, Khatma, Person, Reading } from "@/lib/types";
import { RotaCreateDialog } from "./RotaPanels";

const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const ZONES = ["Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Africa/Cairo", "Europe/London"];

function patchPerson(db: Db, id: string, patch: Partial<Person>): Db {
  return { ...db, people: db.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

function StatusPill({ person }: { person: Person }) {
  if (person.status === "blocked") return <Pill tone="bad">محظور</Pill>;
  if (person.status === "invited") return <Pill tone="info">مدعو</Pill>;
  return <Pill tone="good">نشط</Pill>;
}

export function PersonForm({
  person,
  open,
  onOpenChange,
}: {
  person: Person | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const db = useDb();
  const [name, setName] = useState(person?.name ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "+971");
  const [zone, setZone] = useState(person?.timeZone ?? "Asia/Dubai");
  const taken = db.people.some((p) => p.phone === phone && p.id !== person?.id);
  const valid = name.trim().length > 1 && PHONE_RE.test(phone) && !taken;

  const save = () => {
    if (person) {
      const moved = person.phone !== phone;
      change((d) => patchPerson(d, person.id, { name: name.trim(), phone, timeZone: zone }), {
        action: moved ? "نقل الحساب إلى رقم جديد" : "تعديل بيانات شخص",
        targetKind: "person",
        targetId: person.id,
        targetLabel: name.trim(),
        before: moved ? person.phone : person.name,
        after: moved ? phone : name.trim(),
        note: null,
      });
      toast.success("حُفظ التعديل");
    } else {
      const id = `p${Date.now()}`;
      const created: Person = {
        id,
        name: name.trim(),
        phone,
        timeZone: zone,
        status: "invited",
        verifiedAt: null,
        lastSeenAt: null,
        rotaAllowed: false,
        whatsappNotes: false,
        devices: [],
        adminNote: "",
      };
      change((d) => ({ ...d, people: [created, ...d.people] }), {
        action: "إضافة شخص",
        targetKind: "person",
        targetId: id,
        targetLabel: created.name,
        before: null,
        after: "مدعو",
        note: null,
      });
      toast.success("أُضيف الشخص، وسيكتمل حسابه عند أول دخول");
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{person ? "تعديل الشخص" : "إضافة شخص"}</DialogTitle>
          <DialogDescription>
            {person ? "تغيير الرقم ينقل الحساب كاملاً وينهي جلساته." : "يبقى «مدعواً» حتى يتحقق من رقمه على واتساب."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="الاسم">
            <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="رقم الهاتف">
            <Input id="person-phone" dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {taken && <p className="text-xs text-destructive">هذا الرقم مسجل لشخص آخر.</p>}
          </Field>
          <Field label="المنطقة الزمنية">
            <Select dir="rtl" value={zone} onValueChange={setZone}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
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

function blockPerson(person: Person, note: string | null) {
  change((d) => patchPerson(d, person.id, { status: "blocked", devices: [] }), {
    action: "حظر رقم",
    targetKind: "phone",
    targetId: person.id,
    targetLabel: person.name,
    before: "نشط",
    after: "محظور",
    note,
  });
  toast.success(`حُظر ${person.name}`);
}

function unblockPerson(person: Person) {
  change((d) => patchPerson(d, person.id, { status: "active" }), {
    action: "رفع الحظر",
    targetKind: "phone",
    targetId: person.id,
    targetLabel: person.name,
    before: "محظور",
    after: "نشط",
    note: null,
  });
  toast.success(`رُفع الحظر عن ${person.name}`);
}

function signOutAll(person: Person, note: string | null) {
  change((d) => patchPerson(d, person.id, { devices: [] }), {
    action: "إنهاء كل الجلسات",
    targetKind: "person",
    targetId: person.id,
    targetLabel: person.name,
    before: `${ar(person.devices.length)} أجهزة`,
    after: "٠ أجهزة",
    note,
  });
  toast.success("انتهت كل الجلسات");
}

function askDelete(person: Person, then?: () => void) {
  ask({
    title: `حذف ${person.name} نهائياً؟`,
    body: "يُحذف الحساب وجلساته. تبقى أجزاؤه المقروءة في مجاميع الختمة بلا اسم، وتُحذف طلبات المساعدة. لا يمكن التراجع.",
    confirm: "حذف نهائياً",
    destructive: true,
    typeToConfirm: "حذف",
    note: true,
    onConfirm: (note) => {
      change((d) => ({ ...d, people: d.people.filter((p) => p.id !== person.id) }), {
        action: "حذف حساب",
        targetKind: "person",
        targetId: person.id,
        targetLabel: person.name,
        before: person.phone,
        after: null,
        note,
      });
      toast.success("حُذف الحساب");
      then?.();
    },
  });
}

const HOUR = 3_600_000;

function duration(hours: number) {
  return hours < 24 ? `${num(Math.round(hours))} ساعة` : `${num(Math.round(hours / 24))} يوم`;
}

function ReadingPill({ reading }: { reading: Reading }) {
  if (reading.status === "reading") return <Pill tone="info">يقرأ الآن</Pill>;
  if (reading.status === "released") return <Pill>تركه</Pill>;
  return <Pill tone="good">أنهاه</Pill>;
}

function ReadingTab({ rows }: { rows: Reading[] }) {
  const db = useDb();
  const finished = rows.filter((r) => r.finishedAt !== null);
  const hours = finished.map((r) => (r.finishedAt! - r.takenAt) / HOUR).sort((a, b) => a - b);
  const median = hours.length > 0 ? hours[Math.floor(hours.length / 2)] : null;
  const last = finished.reduce((latest, r) => Math.max(latest, r.finishedAt!), 0);
  const sorted = [...rows].sort((a, b) => b.takenAt - a.takenAt);
  const figures: [string, string][] = [
    ["أجزاء أنهاها", num(finished.length)],
    ["يقرأ الآن", num(rows.filter((r) => r.status === "reading").length)],
    ["مدة الجزء عادة", median === null ? "—" : duration(median)],
    ["آخر قراءة", last ? ago(last) : "—"],
  ];

  return (
    <div className="grid grid-cols-1 gap-3">
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="tabular text-lg font-semibold">{value}</p>
          </div>
        ))}
      </section>
      <ul className="divide-y rounded-lg border bg-card text-[13px]">
        {sorted.length === 0 && <Empty title="لم يأخذ أي جزء بعد" />}
        {sorted.slice(0, 30).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block font-medium">الجزء {num(r.juz)}</span>
              <span className="block text-xs text-muted-foreground">
                {db.khatmas.find((k) => k.id === r.khatmaId)?.name ?? "ختمة محذوفة"} · أخذه {date(r.takenAt)}
                {r.finishedAt ? ` · خلال ${duration((r.finishedAt - r.takenAt) / HOUR)}` : ""}
              </span>
            </span>
            <ReadingPill reading={r} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        يظهر هنا قراءة هذا الشخص وحده للمساعدة في مشكلته. كل اطلاع يُسجَّل، ولا ترتيب بين الناس.
      </p>
    </div>
  );
}

type Segment = "all" | "organizers" | "members" | "none";

const ABSENT_MS = 30 * 86_400_000;

function isAbsent(person: Person) {
  return person.lastSeenAt !== null && Date.now() - person.lastSeenAt > ABSENT_MS;
}

function askRota(person: Person) {
  const turnOn = !person.rotaAllowed;
  ask({
    title: turnOn ? "السماح بالختمة بالتناوب؟" : "إيقاف الختمة بالتناوب؟",
    body: turnOn
      ? `يستطيع ${person.name} إنشاء ختمات بالتناوب.`
      : `لن يستطيع ${person.name} إنشاء ختمات بالتناوب جديدة. تبقى ختماته الحالية.`,
    confirm: turnOn ? "السماح" : "إيقاف",
    note: true,
    onConfirm: (note) => {
      change((d) => patchPerson(d, person.id, { rotaAllowed: turnOn }), {
        action: turnOn ? "السماح بالختمة بالتناوب" : "إيقاف الختمة بالتناوب",
        targetKind: "person",
        targetId: person.id,
        targetLabel: person.name,
        before: turnOn ? "غير مسموح" : "مسموح",
        after: turnOn ? "مسموح" : "غير مسموح",
        note,
      });
      toast.success("تم");
    },
  });
}

function RolePill({ organizes, member }: { organizes: number; member: boolean }) {
  if (organizes > 0) return <Pill tone="info">منظّم</Pill>;
  return member ? <Pill>عضو</Pill> : <Pill tone="warn">بلا ختمة</Pill>;
}

export function PeoplePage() {
  const db = useDb();
  const can = useCan();
  const phone = usePhone();
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [segment, setSegment] = useState<Segment>("all");

  const organized = useMemo(() => {
    const map = new Map<string, Khatma[]>();
    db.khatmas.forEach((k) => map.set(k.organizerId, [...(map.get(k.organizerId) ?? []), k]));
    return map;
  }, [db.khatmas]);
  const membered = useMemo(() => {
    const set = new Set<string>();
    db.khatmas.forEach((k) => k.members.forEach((m) => m.status === "active" && set.add(m.personId)));
    return set;
  }, [db.khatmas]);

  const inSegment = (p: Person, s: Segment) =>
    s === "all" ||
    (s === "organizers" && organized.has(p.id)) ||
    (s === "members" && !organized.has(p.id) && membered.has(p.id)) ||
    (s === "none" && !organized.has(p.id) && !membered.has(p.id));
  const count = (s: Segment) => db.people.filter((p) => inSegment(p, s)).length;
  const organizes = (p: Person) => organized.get(p.id) ?? [];
  const reach = (p: Person) =>
    organizes(p).reduce((sum, k) => sum + k.members.filter((m) => m.status === "active").length, 0);

  const countKhatmas = (id: string) => db.khatmas.filter((k) => k.members.some((m) => m.personId === id && m.status === "active")).length;

  const columns: Column<Person>[] = [
    {
      key: "name",
      header: "الاسم",
      sort: (p) => p.name,
      cell: (p) => (
        <span className="flex items-center gap-2">
          <PersonAvatar name={p.name} className="size-7" />
          <span className="font-medium">{p.name}</span>
        </span>
      ),
    },
    { key: "phone", header: "الهاتف", cell: (p) => <span className="ltr-text inline-block">{phone(p.phone)}</span> },
    { key: "role", header: "الدور", sort: (p) => organizes(p).length, cell: (p) => <RolePill organizes={organizes(p).length} member={membered.has(p.id)} /> },
    { key: "status", header: "الحالة", sort: (p) => p.status, cell: (p) => <StatusPill person={p} /> },
    { key: "khatmas", header: "الختمات", sort: (p) => countKhatmas(p.id), cell: (p) => <span className="tabular">{num(countKhatmas(p.id))}</span> },
    { key: "seen", header: "آخر ظهور", sort: (p) => p.lastSeenAt ?? 0, cell: (p) => <span className="text-muted-foreground">{ago(p.lastSeenAt)}</span> },
    { key: "joined", header: "انضم", sort: (p) => p.verifiedAt ?? 0, cell: (p) => <span className="text-muted-foreground">{date(p.verifiedAt)}</span> },
  ];

  // The real panel keeps numbers masked in this list; opening a person shows the full one.
  const organizerColumns: Column<Person>[] = [
    columns[0],
    { key: "phone", header: "الهاتف", cell: (p) => <span className="ltr-text inline-block">{maskPhone(p.phone)}</span> },
    {
      key: "organizes",
      header: "ينظّم",
      sort: (p) => organizes(p).length,
      cell: (p) => (
        <span className="flex flex-wrap gap-x-2 gap-y-0.5">
          {organizes(p).slice(0, 2).map((k) => (
            <button
              key={k.id}
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={(event) => {
                event.stopPropagation();
                go({ page: "khatma", id: k.id });
              }}
            >
              {k.name}
            </button>
          ))}
          {organizes(p).length > 2 && <span className="text-muted-foreground">+{num(organizes(p).length - 2)}</span>}
        </span>
      ),
    },
    { key: "reach", header: "أعضاء ختماته", sort: reach, cell: (p) => <span className="tabular">{num(reach(p))}</span> },
    {
      key: "rota",
      header: "يُنشئ بالتناوب",
      sort: (p) => (p.rotaAllowed ? 1 : 0),
      cell: (p) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Switch aria-label={`الختمة بالتناوب: ${p.name}`} checked={p.rotaAllowed} disabled={!can("person.edit")} onCheckedChange={() => askRota(p)} />
        </span>
      ),
    },
    {
      key: "seen",
      header: "آخر ظهور",
      sort: (p) => p.lastSeenAt ?? 0,
      cell: (p) => (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {ago(p.lastSeenAt)} {isAbsent(p) && <Pill tone="warn">غائب</Pill>}
        </span>
      ),
    },
  ];

  const filters: Filter<Person>[] = [
    ...(segment === "organizers"
      ? [
          {
            key: "presence",
            label: "الحضور",
            options: [
              { value: "absent", label: "غائب أكثر من ٣٠ يوماً", test: isAbsent },
              { value: "here", label: "حاضر", test: (p: Person) => !isAbsent(p) },
            ],
          },
        ]
      : []),
    {
      key: "status",
      label: "الحالة",
      options: [
        { value: "active", label: "نشط", test: (p) => p.status === "active" },
        { value: "blocked", label: "محظور", test: (p) => p.status === "blocked" },
        { value: "invited", label: "مدعو", test: (p) => p.status === "invited" },
      ],
    },
    {
      key: "access",
      label: "الصلاحية",
      options: [
        { value: "rota", label: "يُنشئ ختمة بالتناوب", test: (p) => p.rotaAllowed },
        { value: "wa", label: "إشعارات واتساب مفعّلة", test: (p) => p.whatsappNotes },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4">
      <PageHeader
        title="الأشخاص"
        description={`${num(db.people.length)} شخصاً. ابحث بالاسم أو الرقم.`}
        actions={
          can("person.edit") && (
            <>
              {segment === "organizers" && (
                <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                  <Plus /> ختمة لمنظّم
                </Button>
              )}
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus /> إضافة شخص
              </Button>
            </>
          )
        }
      />
      <Tabs dir="rtl" value={segment} onValueChange={(v) => setSegment(v as Segment)}>
        <div className="overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <TabsList>
            <TabsTrigger value="all">الكل {num(count("all"))}</TabsTrigger>
            <TabsTrigger value="organizers">المنظّمون {num(count("organizers"))}</TabsTrigger>
            <TabsTrigger value="members">الأعضاء {num(count("members"))}</TabsTrigger>
            <TabsTrigger value="none">بلا ختمة {num(count("none"))}</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>
      <DataTable
        key={segment}
        rows={db.people.filter((p) => inSegment(p, segment))}
        columns={segment === "organizers" ? organizerColumns : columns}
        rowKey={(p) => p.id}
        searchText={(p) => `${p.name} ${p.phone}`}
        searchPlaceholder="اسم أو رقم هاتف"
        filters={filters}
        defaultSort={{ key: "seen", desc: true }}
        onRowClick={(p) => go({ page: "person", id: p.id })}
        card={(p) => (
          <span className="flex items-center gap-2.5">
            <PersonAvatar name={p.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{p.name}</span>
                <RolePill organizes={organizes(p).length} member={membered.has(p.id)} />
                <StatusPill person={p} />
              </span>
              <span className="mt-0.5 flex justify-between gap-2 text-xs text-muted-foreground">
                <span className="ltr-text">{segment === "organizers" ? maskPhone(p.phone) : phone(p.phone)}</span>
                <span>
                  {segment === "organizers" ? `${num(organizes(p).length)} ختمة · ` : ""}
                  {ago(p.lastSeenAt)}
                </span>
              </span>
            </span>
          </span>
        )}
        toolbar={
          can("data.export") && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() =>
                ask({
                  title: "تصدير الأشخاص؟",
                  body: "يحتوي الملف على أسماء وأرقام هواتف. يُسجَّل التصدير في سجل التغييرات.",
                  confirm: "تصدير CSV",
                  note: true,
                  onConfirm: (note) => {
                    change((d) => d, {
                      action: "تصدير بيانات",
                      targetKind: "person",
                      targetId: "all",
                      targetLabel: `${num(db.people.length)} شخصاً`,
                      before: null,
                      after: "CSV",
                      note,
                    });
                    toast.success("صُدّر الملف (محاكاة)");
                  },
                })
              }
            >
              <Download /> تصدير
            </Button>
          )
        }
        bulk={
          can("person.block")
            ? (ids, clear) => {
                const picked = db.people.filter((p) => ids.includes(p.id));
                return (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        ask({
                          title: `إنهاء جلسات ${num(picked.length)} أشخاص؟`,
                          body: "يخرجون من كل أجهزتهم ويدخلون من جديد برمز واتساب.",
                          confirm: "إنهاء الجلسات",
                          note: true,
                          onConfirm: (note) => {
                            picked.forEach((p) => signOutAll(p, note));
                            clear();
                          },
                        })
                      }
                    >
                      <LogOut /> إنهاء الجلسات
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() =>
                        ask({
                          title: `حظر ${num(picked.length)} أرقام؟`,
                          body: "لن يستطيعوا الدخول أو الانضمام إلى ختمات.",
                          confirm: "حظر",
                          destructive: true,
                          note: true,
                          onConfirm: (note) => {
                            picked.forEach((p) => blockPerson(p, note));
                            clear();
                          },
                        })
                      }
                    >
                      <Ban /> حظر
                    </Button>
                  </>
                );
              }
            : undefined
        }
      />
      {adding && <PersonForm person={null} open onOpenChange={setAdding} />}
      {creating && <RotaCreateDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

export function PersonPage({ id }: { id: string }) {
  const db = useDb();
  const can = useCan();
  const phone = usePhone();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState("summary");
  const allowed = useCanPage();
  const shown: Record<string, boolean> = { reading: can("reading.view"), help: allowed("help"), messages: allowed("messages"), audit: allowed("audit") };
  const person = db.people.find((p) => p.id === id);

  if (!person) {
    return (
      <Empty title="هذا الشخص لم يعد موجوداً" hint="ربما حُذف حسابه." />
    );
  }

  const memberships = db.khatmas
    .filter((k) => k.members.some((m) => m.personId === id))
    .map((k) => ({ khatma: k, member: k.members.find((m) => m.personId === id)! }));
  const help = db.help.filter((h) => h.personId === id);
  const messages = db.messages.filter((m) => m.personId === id);
  const reading = db.reading.filter((r) => r.personId === id);
  const audit = db.audit.filter((a) => a.targetId === id);

  const logReadingView = () =>
    change((d) => d, {
      action: "الاطلاع على القراءة",
      targetKind: "person",
      targetId: id,
      targetLabel: person.name,
      before: null,
      after: null,
      note: null,
    });

  return (
    <div className="grid grid-cols-1 gap-4">
      <button type="button" onClick={() => go({ page: "people" })} className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" /> الأشخاص
      </button>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={person.name} className="size-12" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {person.name} <StatusPill person={person} />
              {db.khatmas.some((k) => k.organizerId === id) && <Pill tone="info">منظّم</Pill>}
              {person.rotaAllowed && <Pill tone="info">يُنشئ ختمة بالتناوب</Pill>}
            </h1>
            <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
              <span className="ltr-text">{phone(person.phone)}</span>
              {can("phone.view") && <CopyButton value={person.phone} label="نسخ الرقم" />}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can("person.edit") && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil /> تعديل
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={person.devices.length === 0}
                onClick={() =>
                  ask({
                    title: "إنهاء كل الجلسات؟",
                    body: `يخرج ${person.name} من كل أجهزته ويدخل من جديد برمز واتساب.`,
                    confirm: "إنهاء الجلسات",
                    note: true,
                    onConfirm: (note) => signOutAll(person, note),
                  })
                }
              >
                <LogOut /> إنهاء الجلسات
              </Button>
            </>
          )}
          {can("person.block") && (
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  المزيد <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() =>
                    change((d) => patchPerson(d, id, { rotaAllowed: !person.rotaAllowed }), {
                      action: person.rotaAllowed ? "إيقاف الختمة بالتناوب" : "السماح بالختمة بالتناوب",
                      targetKind: "person",
                      targetId: id,
                      targetLabel: person.name,
                      before: person.rotaAllowed ? "مسموح" : "غير مسموح",
                      after: person.rotaAllowed ? "غير مسموح" : "مسموح",
                      note: null,
                    })
                  }
                >
                  <ShieldCheck /> {person.rotaAllowed ? "إيقاف الختمة بالتناوب" : "السماح بالختمة بالتناوب"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Phone /> نقل إلى رقم جديد
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {person.status === "blocked" ? (
                  <DropdownMenuItem onSelect={() => unblockPerson(person)}>
                    <UserCheck /> رفع الحظر
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      ask({
                        title: `حظر ${person.name}؟`,
                        body: "ينتهي دخوله ولا يستطيع الانضمام إلى أي ختمة. يمكن رفع الحظر لاحقاً.",
                        confirm: "حظر",
                        destructive: true,
                        note: true,
                        onConfirm: (note) => blockPerson(person, note),
                      })
                    }
                  >
                    <Ban /> حظر الرقم
                  </DropdownMenuItem>
                )}
                {can("person.delete") && (
                  <DropdownMenuItem variant="destructive" onSelect={() => askDelete(person, () => go({ page: "people" }))}>
                    <Trash2 /> حذف الحساب
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <Tabs
        dir="rtl"
        // A role without access falls back to the summary.
        value={shown[tab] === false ? "summary" : tab}
        onValueChange={(next) => {
          setTab(next);
          if (next === "reading") logReadingView();
        }}
      >
        <div className="overflow-x-auto overflow-y-hidden">
          <TabsList>
            <TabsTrigger value="summary">الملخص</TabsTrigger>
            <TabsTrigger value="khatmas">الختمات ({num(memberships.length)})</TabsTrigger>
            {can("reading.view") && <TabsTrigger value="reading">القراءة</TabsTrigger>}
            {shown.help && <TabsTrigger value="help">المساعدة ({num(help.length)})</TabsTrigger>}
            {shown.messages && <TabsTrigger value="messages">واتساب ({num(messages.length)})</TabsTrigger>}
            {shown.audit && <TabsTrigger value="audit">السجل ({num(audit.length)})</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="summary" className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-[13px] font-medium">الحساب</h2>
            <DetailList
              rows={[
                ["تحقق من رقمه", dateTime(person.verifiedAt)],
                ["آخر ظهور", ago(person.lastSeenAt)],
                ["المنطقة الزمنية", <span className="ltr-text" key="z">{person.timeZone}</span>],
                [
                  "إشعارات واتساب",
                  <Switch
                    key="wa"
                    aria-label="إشعارات واتساب"
                    checked={person.whatsappNotes}
                    disabled={!can("person.edit")}
                    onCheckedChange={(on) => change((d) => patchPerson(d, id, { whatsappNotes: on }))}
                  />,
                ],
              ]}
            />
            <p className="mt-3 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
              القراءة في تبويبها لمن يملك الصلاحية، ويُسجَّل كل اطلاع عليها.
            </p>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 text-[13px] font-medium">الأجهزة ({num(person.devices.length)})</h2>
            {person.devices.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">لا توجد جلسات نشطة.</p>
            ) : (
              <ul className="divide-y text-[13px]">
                {person.devices.map((device, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1.5">
                    <span>{device.label}</span>
                    <span className="text-muted-foreground">{ago(device.lastUsedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="mt-4 mb-1.5 text-[13px] font-medium">ملاحظة داخلية</h2>
            <Textarea
              id="admin-note"
              rows={2}
              disabled={!can("person.edit")}
              placeholder="يراها المشرفون فقط"
              defaultValue={person.adminNote}
              onBlur={(e) => change((d) => patchPerson(d, id, { adminNote: e.target.value }))}
            />
          </section>
        </TabsContent>

        <TabsContent value="khatmas" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card">
            {memberships.length === 0 && <Empty title="ليس في أي ختمة" />}
            {memberships.map(({ khatma, member }) => (
              <li key={khatma.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-[13px] hover:bg-accent" onClick={() => go({ page: "khatma", id: khatma.id })}>
                  <span className="font-medium">{khatma.name}</span>
                  <span className="flex gap-1.5">
                    {khatma.organizerId === id && <Pill tone="info">منظّم</Pill>}
                    {member.status === "active" ? <Pill tone="good">عضو</Pill> : member.status === "blocked" ? <Pill tone="bad">محظور فيها</Pill> : <Pill>غادر</Pill>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>

        {can("reading.view") && (
          <TabsContent value="reading" className="mt-3">
            <ReadingTab rows={reading} />
          </TabsContent>
        )}

        <TabsContent value="help" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card">
            {help.length === 0 && <Empty title="لا توجد طلبات مساعدة" />}
            {help.map((h) => (
              <li key={h.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-[13px] hover:bg-accent" onClick={() => go({ page: "help", id: h.id })}>
                  <span className="truncate">{h.messages[0].text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ago(h.lastMessageAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="messages" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {messages.length === 0 && <Empty title="لم تُرسل له رسائل بعد" />}
            {messages.slice(0, 20).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block">{m.template}</span>
                  {m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{ago(m.at)}</span>
                  {m.status === "failed" ? <Pill tone="bad">فشلت</Pill> : m.status === "skipped" ? <Pill tone="warn">تُخطيت</Pill> : <Pill tone="good">{m.status === "read" ? "قُرئت" : "وصلت"}</Pill>}
                </span>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="audit" className="mt-3">
          <ul className="divide-y rounded-lg border bg-card text-[13px]">
            {audit.length === 0 && <Empty title="لم يغيّر أحد شيئاً في هذا الحساب" />}
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
        </TabsContent>
      </Tabs>

      {editing && <PersonForm person={person} open onOpenChange={setEditing} />}
    </div>
  );
}
