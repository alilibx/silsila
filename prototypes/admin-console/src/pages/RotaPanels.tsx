import { useState, type ReactNode } from "react";
import { Check, Clock, Link2, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { CopyButton, DetailList, Field, Pill, ask } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { ago, ar, date, maskPhone, num, timeText } from "@/lib/format";
import * as ops from "@/lib/rota";
import { change, getDb, go, useCan, useCanPage, useDb, usePhone } from "@/lib/store";
import type { Khatma, RotaMessages, RotaParticipant, RotaRead, RotaState } from "@/lib/types";
import { cn } from "@/lib/utils";

type RotaKhatma = Khatma & { rota: RotaState };

const TIMES = Array.from({ length: 96 }, (_, i) => i * 15);

/** Runs a rota change; a refused one shows its reason instead of failing silently. */
function attempt(run: () => void, done = "تم، وسُجّل في سجل التغييرات") {
  try {
    run();
    toast.success(done);
    return true;
  } catch (error) {
    toast.error((error as Error).message);
    return false;
  }
}

function useEditable(khatma: RotaKhatma) {
  const can = useCan();
  return can("khatma.edit") && khatma.status !== "archived";
}

function isoDate(iso: string) {
  return date(Date.parse(iso));
}

function SideSheet({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side={mobile ? "bottom" : "right"} className={cn("overflow-y-auto", mobile ? "max-h-[85svh]" : "w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="grid gap-3 px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function JuzSheet({ khatma, read, onClose }: { khatma: RotaKhatma; read: RotaRead; onClose: () => void }) {
  const { rota } = khatma;
  const editable = useEditable(khatma);
  const [picking, setPicking] = useState(false);
  const done = read.doneAt !== null;
  const holder = ops.participantName(rota, read.holderId);
  const reader = ops.participantName(rota, read.readerId);

  if (picking) {
    return (
      <SideSheet title={`من يقرأ الجزء ${ar(read.juz)} اليوم؟`} onClose={onClose}>
        <ul className="divide-y rounded-lg border text-[13px]">
          {rota.participants.map((p) => {
            const mine = rota.today.filter((r) => r.readerId === p.id);
            const finished = mine.length > 0 && mine.every((r) => r.doneAt !== null);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-accent"
                  onClick={() => attempt(() => ops.reassign(khatma.id, read.juz, p.id)) && onClose()}
                >
                  {p.name}
                  <span className="text-xs text-muted-foreground">{finished ? "أتمّ جزأه اليوم" : mine.length > 0 ? "يقرؤه الآن" : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </SideSheet>
    );
  }

  return (
    <SideSheet title={done ? `الجزء ${ar(read.juz)} تمّت قراءته` : `الجزء ${ar(read.juz)} لم يُقرأ بعد`} onClose={onClose}>
      <DetailList
        rows={[
          ["صاحبه اليوم", holder ?? "بلا قارئ"],
          [done ? "قرأه" : "يقرؤه الآن", reader ?? "—"],
          ["الرد", done ? (read.doneByOrganizer ? "سجّله المنظّم أو المشرف" : `أنهاه ${ago(read.doneAt)}`) : read.notYet ? "ردّ: ليس بعد" : "لم يردّ"],
        ]}
      />
      {editable &&
        (done ? (
          <Button variant="outline" onClick={() => attempt(() => ops.markNotDone(khatma.id, read.juz)) && onClose()}>
            ليس بعد؟ ألغِ التسجيل
          </Button>
        ) : (
          <>
            <Button onClick={() => attempt(() => ops.markDone(khatma.id, read.juz)) && onClose()}>
              <Check /> سجّله تامّاً
            </Button>
            <Button variant="outline" onClick={() => setPicking(true)}>
              <UserRound /> أسنده إلى مشارك
            </Button>
          </>
        ))}
    </SideSheet>
  );
}

function TodayPanel({ khatma }: { khatma: RotaKhatma }) {
  const { rota } = khatma;
  const [open, setOpen] = useState<number | null>(null);
  const done = ops.doneCount(rota);
  const read = rota.today.find((r) => r.juz === open);

  return (
    <div className="grid grid-cols-1 gap-3">
      {rota.pausedAt !== null && (
        <p className="rounded-md bg-saffron-soft px-3 py-2 text-[13px] text-saffron-ink">
          الختمة موقوفة الآن. لا رسائل ولا يتقدّم رقم الختمة حتى تعيد تشغيلها.
        </p>
      )}
      {done === ops.ROTA_SIZE && (
        <p className="rounded-md bg-good-soft px-3 py-2 text-[13px] text-good">اكتملت الختمة {ar(rota.number)}. تقبّل الله منكم.</p>
      )}
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-medium">الختمة {ar(rota.number)} · اليوم</h2>
            <p className="text-xs text-muted-foreground">الدورة {ar(rota.cycle)}</p>
          </div>
          <p className="tabular text-xl font-semibold">
            {num(done)} / {num(ops.ROTA_SIZE)}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${(done / ops.ROTA_SIZE) * 100}%` }} />
        </div>
        <div role="group" aria-label="أجزاء اليوم" className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10">
          {rota.today.map((r) => {
            const finished = r.doneAt !== null;
            return (
              <button
                key={r.juz}
                type="button"
                onClick={() => setOpen(r.juz)}
                aria-label={`الجزء ${ar(r.juz)}، ${finished ? "تمّ" : r.reassigned ? "أُسند" : "لم يُقرأ"}`}
                className={cn(
                  "tabular flex h-11 flex-col items-center justify-center rounded-md border text-[13px] font-medium hover:ring-2 hover:ring-ring/40",
                  finished ? "border-transparent bg-good-soft text-good" : r.reassigned ? "border-info/40 bg-info-soft text-info" : "bg-background",
                )}
              >
                {ar(r.juz)}
                {finished ? <Check className="size-3" /> : r.reassigned ? <UserRound className="size-3" /> : r.notYet ? <Clock className="size-3 text-muted-foreground" /> : null}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1"><Check className="size-3 text-good" /> تمّ</li>
          <li className="flex items-center gap-1"><UserRound className="size-3 text-info" /> أُسند</li>
          <li className="flex items-center gap-1"><Clock className="size-3" /> ردّ: ليس بعد</li>
          <li>فارغ: لم يُقرأ</li>
        </ul>
      </section>
      {read && <JuzSheet key={read.juz} khatma={khatma} read={read} onClose={() => setOpen(null)} />}
    </div>
  );
}

function JoinStatus({ person }: { person: RotaParticipant }) {
  if (person.stoppedAt !== null) return <Pill tone="bad">أوقف الرسائل</Pill>;
  if (person.silencedAt !== null) return <Pill tone="warn">أوقفنا الرسائل</Pill>;
  if (person.joinedAt === null) return <Pill tone="warn">لم ينضمّ</Pill>;
  if (person.silentDays > 0) return <Pill>صامت {ar(person.silentDays)} أيام</Pill>;
  return <Pill tone="good">انضمّ</Pill>;
}

function SlotSelect({ value, onChange, slots, number, rota, label }: { value: string; onChange: (slot: string) => void; slots: number[]; number: number; rota: RotaState; label: string }) {
  return (
    <Select dir="rtl" value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder="اختر جزءاً" />
      </SelectTrigger>
      <SelectContent>
        {slots.map((slot) => {
          const other = ops.participantName(rota, rota.slots[slot - 1]);
          return (
            <SelectItem key={slot} value={String(slot)}>
              الجزء {ar(ops.juzOfSlot(slot, number))}
              {other ? ` · سيتبادل مع ${other}` : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ParticipantSheet({ khatma, person, onClose }: { khatma: RotaKhatma; person: RotaParticipant; onClose: () => void }) {
  const { rota } = khatma;
  const editable = useEditable(khatma);
  const canPhone = usePhone();
  const [moveTo, setMoveTo] = useState("");
  const [give, setGive] = useState("");
  const own = ops.slotsOf(rota, person.id);
  const others = rota.slots.flatMap((owner, i) => (owner !== person.id ? [i + 1] : []));
  const free = ops.freeSlots(rota);
  const first = own[0];

  return (
    <SideSheet title={person.name} description={person.phoneHidden ? "رقمه مخفي عن المنظّم." : undefined} onClose={onClose}>
      <DetailList
        rows={[
          ["الرقم", <span key="p" className="ltr-text">{canPhone(person.phone)}</span>],
          ["الحالة", <JoinStatus key="s" person={person} />],
          ["جزؤه اليوم", own.map((s) => `الجزء ${ar(ops.juzOfSlot(s, rota.number))}`).join("، ") || "—"],
          ...(first
            ? ([["يتقدّم", `يقرأ الجزء ${ar(ops.juzOfSlot(first, rota.number))} في الختمة ${ar(rota.number)}، ثم ${ar(ops.juzOfSlot(first, rota.number + 1))} في التالية`]] as [string, string][])
            : []),
        ]}
      />
      {person.personId && (
        <Button variant="outline" size="sm" onClick={() => go({ page: "person", id: person.personId! })}>
          افتح حسابه
        </Button>
      )}
      {editable && first !== undefined && (
        <Field label="انقله إلى الجزء">
          <SlotSelect value={moveTo} onChange={setMoveTo} slots={others} number={rota.number} rota={rota} label="انقله إلى الجزء" />
          <Button size="sm" variant="outline" disabled={!moveTo} onClick={() => attempt(() => ops.moveSlot(khatma.id, person.id, first, Number(moveTo))) && onClose()}>
            انقله
          </Button>
        </Field>
      )}
      {editable && free.length > 0 && (
        <Field label="أعطه جزءاً آخر">
          <SlotSelect value={give} onChange={setGive} slots={free} number={rota.number} rota={rota} label="أعطه جزءاً آخر" />
          <Button size="sm" variant="outline" disabled={!give} onClick={() => attempt(() => ops.giveSlot(khatma.id, person.id, Number(give))) && onClose()}>
            أعطه
          </Button>
        </Field>
      )}
      {editable && (
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() =>
            ask({
              title: `أزل ${person.name} من الختمة؟`,
              body: "يصبح جزؤه بلا قارئ، وتبقى قراءته اليوم كما هي.",
              confirm: "نعم، أزله",
              destructive: true,
              onConfirm: () => {
                if (attempt(() => ops.removeParticipant(khatma.id, person.id))) onClose();
              },
            })
          }
        >
          أزله من الختمة
        </Button>
      )}
    </SideSheet>
  );
}

function AddReader({ khatma, slot, onClose }: { khatma: RotaKhatma; slot: number; onClose: () => void }) {
  const { rota } = khatma;
  const db = useDb();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+971");
  const juz = ops.juzOfSlot(slot, rota.number);
  // Anyone this organizer added to another rotating khatma.
  const saved = db.khatmas
    .filter((k) => k.id !== khatma.id && k.organizerId === khatma.organizerId && k.rota)
    .flatMap((k) => k.rota!.participants)
    .filter((p, i, list) => list.findIndex((x) => x.phone === p.phone) === i && !rota.participants.some((x) => x.phone === p.phone));
  const valid = name.trim().length > 1 && /^\+[1-9]\d{7,14}$/.test(phone);

  return (
    <SideSheet title={`قارئ الجزء ${ar(juz)}`} onClose={onClose}>
      {rota.participants.length > 0 && (
        <Field label="من في الختمة">
          <ul className="divide-y rounded-md border text-[13px]">
            {rota.participants.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button type="button" className="w-full px-2.5 py-1.5 text-start hover:bg-accent" onClick={() => attempt(() => ops.giveSlot(khatma.id, p.id, slot)) && onClose()}>
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
      {saved.length > 0 && (
        <Field label="من ختمات سابقة">
          <ul className="divide-y rounded-md border text-[13px]">
            {saved.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full px-2.5 py-1.5 text-start hover:bg-accent"
                  onClick={() => attempt(() => ops.addParticipant(khatma.id, { name: p.name, phone: p.phone, personId: p.personId }, slot)) && onClose()}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </Field>
      )}
      <Field label="الاسم">
        <Input id="reader-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="الرقم">
        <Input id="reader-phone" dir="ltr" className="text-start" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Button disabled={!valid} onClick={() => attempt(() => ops.addParticipant(khatma.id, { name: name.trim(), phone }, slot)) && onClose()}>
        <Plus /> أضف
      </Button>
    </SideSheet>
  );
}

function PeoplePanel({ khatma }: { khatma: RotaKhatma }) {
  const { rota } = khatma;
  const editable = useEditable(khatma);
  const phone = usePhone();
  const [openId, setOpenId] = useState<string | null>(null);
  const [addSlot, setAddSlot] = useState<number | null>(null);
  const [requestSlot, setRequestSlot] = useState<Record<string, string>>({});
  const free = ops.freeSlots(rota);
  const person = rota.participants.find((p) => p.id === openId);
  const joinLink = `https://wa.me/971555000100?text=${encodeURIComponent(rota.joinCode)}`;

  return (
    <div className="grid grid-cols-1 gap-3">
      <section className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2.5 text-[13px]">
        <span className="flex min-w-0 items-center gap-2">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block font-medium">رابط الانضمام</span>
            <span className="block truncate text-xs text-muted-foreground">يرسل من يضغطه «{rota.joinCode}» على واتساب</span>
          </span>
        </span>
        <CopyButton value={joinLink} label="نسخ رابط الانضمام" />
      </section>

      {rota.joinRequests.length > 0 && (
        <section className="rounded-lg border bg-card">
          <h2 className="border-b px-3 py-2 text-[13px] font-medium">طلبات الانضمام ({num(rota.joinRequests.length)})</h2>
          <ul className="divide-y text-[13px]">
            {rota.joinRequests.map((request) => (
              <li key={request.id} className="grid gap-2 px-3 py-2.5">
                <p>
                  {request.name ?? "بلا اسم"} · <span className="ltr-text">{phone(request.phone)}</span>
                  <span className="text-xs text-muted-foreground"> · {ago(request.at)}</span>
                </p>
                {editable && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-40 grow">
                      <SlotSelect
                        value={requestSlot[request.id] ?? ""}
                        onChange={(slot) => setRequestSlot((s) => ({ ...s, [request.id]: slot }))}
                        slots={free}
                        number={rota.number}
                        rota={rota}
                        label="جزؤه"
                      />
                    </span>
                    <Button size="sm" disabled={!requestSlot[request.id]} onClick={() => attempt(() => ops.acceptRequest(khatma.id, request.id, Number(requestSlot[request.id])))}>
                      أضفه
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => attempt(() => ops.declineRequest(khatma.id, request.id), "رُفض الطلب")}>
                      لا
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {free.length > 0 && (
        <p className="rounded-md bg-saffron-soft px-3 py-2 text-[13px] text-saffron-ink">
          بقي {num(free.length)} من الأجزاء بلا قارئ. أعطها لمن يحب أن يقرأ أكثر، أو أضف أشخاصاً.
        </p>
      )}

      <ul className="divide-y rounded-lg border bg-card text-[13px]">
        {rota.slots.map((owner, i) => {
          const slot = i + 1;
          const juz = ops.juzOfSlot(slot, rota.number);
          const participant = rota.participants.find((p) => p.id === owner);
          return (
            <li key={slot}>
              {participant ? (
                <button type="button" onClick={() => setOpenId(participant.id)} className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-accent">
                  <span className="tabular w-7 shrink-0 text-center font-medium text-primary">{ar(juz)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{participant.name}</span>
                    <span className="ltr-text block text-end text-xs text-muted-foreground">
                      {participant.phoneHidden ? maskPhone(participant.phone) : phone(participant.phone)}
                    </span>
                  </span>
                  <JoinStatus person={participant} />
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="tabular w-7 shrink-0 text-center font-medium text-muted-foreground">{ar(juz)}</span>
                  {editable ? (
                    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setAddSlot(slot)}>
                      + أضف قارئاً للجزء {ar(juz)}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">بلا قارئ</span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {person && <ParticipantSheet key={person.id} khatma={khatma} person={person} onClose={() => setOpenId(null)} />}
      {addSlot !== null && <AddReader khatma={khatma} slot={addSlot} onClose={() => setAddSlot(null)} />}
    </div>
  );
}

function TimeSelect({ value, onChange, label, disabled }: { value: number; onChange: (minutes: number) => void; label: string; disabled?: boolean }) {
  return (
    <Select dir="rtl" value={String(value)} disabled={disabled} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger size="sm" className="w-28" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIMES.map((minutes) => (
          <SelectItem key={minutes} value={String(minutes)}>
            {timeText(minutes)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const MESSAGES: { key: "reminder" | "unread" | "summary"; label: string; what: string }[] = [
  { key: "reminder", label: "تذكير القراءة", what: "لمن لم يُنهِ جزأه." },
  { key: "unread", label: "الأجزاء غير المقروءة", what: "قائمة للمنظّم." },
  { key: "summary", label: "ملخص اليوم", what: "ما تمّ في اليوم، للمنظّم." },
];

function SettingsPanel({ khatma }: { khatma: RotaKhatma }) {
  const { rota } = khatma;
  const editable = useEditable(khatma);
  const [pauseDate, setPauseDate] = useState("");
  const set = (next: RotaMessages) => attempt(() => ops.setMessages(khatma.id, next));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-[13px] font-medium">الختمة</h2>
        <DetailList
          rows={[
            ["أيام القراءة", rota.daysLabel],
            ["نبدأ", `${isoDate(rota.firstDate)} · لا يتغير بعد البداية`],
            ["التوقيت", <span key="z" className="ltr-text">{rota.timeZone}</span>],
          ]}
        />
        <div className="mt-3">
          <Field label="ننتهي">
            <div className="flex items-center gap-2">
              <Input
                id="rota-end"
                type="date"
                dir="ltr"
                disabled={!editable}
                value={rota.endDate ?? ""}
                onChange={(e) => attempt(() => ops.setEndDate(khatma.id, e.target.value || null))}
              />
              {rota.endDate === null && <span className="shrink-0 text-xs text-muted-foreground">تستمر دائماً</span>}
            </div>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-1 text-[13px] font-medium">الرسائل</h2>
        <ul className="divide-y text-[13px]">
          <li className="flex items-center justify-between gap-3 py-2">
            <span className="font-medium">رسالة الجزء</span>
            <TimeSelect label="وقت رسالة الجزء" value={rota.messages.dayAt} disabled={!editable} onChange={(at) => set({ ...rota.messages, dayAt: at })} />
          </li>
          {MESSAGES.map((item) => {
            const message = rota.messages[item.key];
            return (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.what}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <TimeSelect label={item.label} value={message.at} disabled={!editable || !message.on} onChange={(at) => set({ ...rota.messages, [item.key]: { ...message, at } })} />
                  <Switch aria-label={item.label} checked={message.on} disabled={!editable} onCheckedChange={(on) => set({ ...rota.messages, [item.key]: { ...message, on } })} />
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <span>
            <h2 className="text-[13px] font-medium">إيقاف الختمة</h2>
            <p className="text-xs text-muted-foreground">لا رسائل ولا يتقدّم الرقم حتى تعيد تشغيلها.</p>
          </span>
          <Switch aria-label="إيقاف الختمة" checked={rota.pausedAt !== null} disabled={!editable} onCheckedChange={(on) => attempt(() => ops.setPaused(khatma.id, on))} />
        </div>
        <h3 className="mt-3 text-xs font-medium text-muted-foreground">أيام توقف محددة</h3>
        {rota.pauseDates.length === 0 && <p className="mt-1 text-[13px] text-muted-foreground">لا توجد أيام.</p>}
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {rota.pauseDates.map((day) => (
            <li key={day} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
              {isoDate(day)}
              {editable && (
                <button type="button" aria-label={`إزالة ${isoDate(day)}`} className="text-muted-foreground" onClick={() => attempt(() => ops.removePauseDate(khatma.id, day))}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="mt-2 flex items-center gap-2">
            <Input id="pause-date" type="date" dir="ltr" className="max-w-44" value={pauseDate} onChange={(e) => setPauseDate(e.target.value)} />
            <Button
              size="sm"
              variant="outline"
              disabled={!pauseDate}
              onClick={() => {
                if (attempt(() => ops.addPauseDate(khatma.id, pauseDate))) setPauseDate("");
              }}
            >
              أضف يوماً
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

export function RotaTabs({ khatma, details, audit, auditCount }: { khatma: RotaKhatma; details: ReactNode; audit: ReactNode; auditCount: number }) {
  const { rota } = khatma;
  const allowed = useCanPage();
  const can = useCan();
  const [tab, setTab] = useState(rota.setupDone ? "today" : "people");

  return (
    <div className="grid grid-cols-1 gap-3">
      {rota.pendingOrganizer && (
        <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          أُنشئت نيابةً عن منظّمها، ويصبح منظّماً حين يرسل رسالة الانضمام بنفسه.
        </p>
      )}
      {!rota.setupDone && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-saffron-soft px-3 py-2 text-[13px] text-saffron-ink">
          أضف من سيقرأ، ثم اضغط «ابدأ الختمة».
          {can("khatma.edit") && (
            <Button size="sm" disabled={rota.participants.length === 0} onClick={() => attempt(() => ops.finishSetup(khatma.id), "بدأت الختمة")}>
              ابدأ الختمة
            </Button>
          )}
        </div>
      )}
      <Tabs dir="rtl" value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <TabsList>
            <TabsTrigger value="today">اليوم</TabsTrigger>
            <TabsTrigger value="people">المشاركون ({num(rota.participants.length)})</TabsTrigger>
            <TabsTrigger value="settings">الإعدادات</TabsTrigger>
            <TabsTrigger value="details">التفاصيل</TabsTrigger>
            {allowed("audit") && <TabsTrigger value="audit">السجل ({num(auditCount)})</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="today" className="mt-3">
          <TodayPanel khatma={khatma} />
        </TabsContent>
        <TabsContent value="people" className="mt-3">
          <PeoplePanel khatma={khatma} />
        </TabsContent>
        <TabsContent value="settings" className="mt-3">
          <SettingsPanel khatma={khatma} />
        </TabsContent>
        <TabsContent value="details" className="mt-3">
          {details}
        </TabsContent>
        <TabsContent value="audit" className="mt-3">
          {audit}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const SATURDAY_FIRST = [6, 0, 1, 2, 3, 4, 5];

/** A rotating khatma set up on someone's behalf: whose it is, its name, and when it's read. */
export function RotaCreateDialog({ onClose }: { onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [organizerName, setOrganizerName] = useState("");
  const [organizerPhone, setOrganizerPhone] = useState("+971");
  const [name, setName] = useState("");
  const [every, setEvery] = useState<"daily" | "weekly" | "biweekly" | "monthly">("daily");
  const [weekdays, setWeekdays] = useState<number[]>([5]);
  const [monthDays, setMonthDays] = useState("1");
  const [firstDate, setFirstDate] = useState(today);
  const [endDate, setEndDate] = useState("");

  const days = monthDays.split(/[\s,،]+/).map(Number).filter((n) => n >= 1 && n <= 31);
  const daysLabel =
    every === "daily"
      ? "كل يوم"
      : every === "monthly"
        ? `كل شهر: ${days.map((d) => ar(d)).join("، ")}`
        : `${every === "weekly" ? "كل أسبوع" : "كل أسبوعين"}: ${weekdays.map((d) => WEEKDAYS[d]).join("، ")}`;
  const validDays = every === "daily" || (every === "monthly" ? days.length > 0 : weekdays.length > 0);
  const valid =
    organizerName.trim().length > 1 &&
    /^\+[1-9]\d{7,14}$/.test(organizerPhone) &&
    name.trim().length > 1 &&
    validDays &&
    firstDate !== "" &&
    (endDate === "" || endDate >= firstDate);

  const create = () => {
    const db = getDb();
    const existing = db.people.find((p) => p.phone === organizerPhone);
    const personId = existing?.id ?? `p${Date.now()}`;
    const id = `k${Date.now()}`;
    const rota: RotaState = {
      number: 1,
      cycle: 1,
      slots: Array.from({ length: ops.ROTA_SIZE }, () => null),
      participants: [],
      today: Array.from({ length: ops.ROTA_SIZE }, (_, i) => ({ juz: i + 1, holderId: null, readerId: null, doneAt: null, doneByOrganizer: false, reassigned: false, notYet: false })),
      joinRequests: [],
      joinCode: `ختمة ${Math.floor(1000 + Math.random() * 9000)}`,
      daysLabel,
      firstDate,
      endDate: endDate || null,
      timeZone: "Asia/Dubai",
      messages: { dayAt: 480, reminder: { at: 960, on: true }, unread: { at: 1140, on: true }, summary: { at: 1260, on: false } },
      pausedAt: null,
      pauseDates: [],
      setupDone: false,
      pendingOrganizer: true,
    };
    const khatma: Khatma = {
      id,
      name: name.trim(),
      kind: "rota",
      status: "active",
      organizerId: personId,
      inviteCode: Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join(""),
      schedule: daysLabel,
      completed: 0,
      createdAt: Date.now(),
      members: [{ personId, status: "active", joinedAt: Date.now() }],
      rota,
    };
    change(
      (d) => ({
        ...d,
        people: existing
          ? d.people
          : [{ id: personId, name: organizerName.trim(), phone: organizerPhone, timeZone: "Asia/Dubai", status: "invited", verifiedAt: null, lastSeenAt: null, rotaAllowed: true, whatsappNotes: false, devices: [], adminNote: "" }, ...d.people],
        khatmas: [khatma, ...d.khatmas],
      }),
      { action: "إنشاء ختمة بالتناوب لمنظّم", targetKind: "khatma", targetId: id, targetLabel: khatma.name, before: null, after: `المنظّم: ${organizerName.trim()}`, note: null },
    );
    toast.success("أُنشئت الختمة. أضف من سيقرأ.");
    onClose();
    go({ page: "khatma", id });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ختمة بالتناوب لمنظّم</DialogTitle>
          <DialogDescription>تُنشأ باسمه، ويصبح منظّمها حين ينضمّ بنفسه عبر واتساب.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="اسم المنظّم">
            <Input id="organizer-name" maxLength={60} value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} />
          </Field>
          <Field label="رقم المنظّم">
            <Input id="organizer-phone" dir="ltr" className="text-start" value={organizerPhone} onChange={(e) => setOrganizerPhone(e.target.value)} />
          </Field>
          <Field label="اسم الختمة">
            <Input id="rota-name" placeholder="مثلاً: ختمة العائلة" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="متى تقرؤون؟">
            <Select dir="rtl" value={every} onValueChange={(v) => setEvery(v as typeof every)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">كل يوم</SelectItem>
                <SelectItem value="weekly">كل أسبوع</SelectItem>
                <SelectItem value="biweekly">كل أسبوعين</SelectItem>
                <SelectItem value="monthly">كل شهر</SelectItem>
              </SelectContent>
            </Select>
            {(every === "weekly" || every === "biweekly") && (
              <div className="flex flex-wrap gap-1">
                {SATURDAY_FIRST.map((day) => {
                  const on = weekdays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays((list) => (on ? list.filter((d) => d !== day) : [...list, day]))}
                      className={cn("rounded-md border px-2 py-1 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
                    >
                      {WEEKDAYS[day]}
                    </button>
                  );
                })}
              </div>
            )}
            {every === "monthly" && (
              <Input id="month-days" dir="ltr" placeholder="1, 15" value={monthDays} onChange={(e) => setMonthDays(e.target.value)} aria-label="في أيام الشهر" />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="نبدأ">
              <Input id="rota-first" type="date" dir="ltr" min={today} value={firstDate} onChange={(e) => setFirstDate(e.target.value)} />
            </Field>
            <Field label="ننتهي (اختياري)">
              <Input id="rota-last" type="date" dir="ltr" min={firstDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button disabled={!valid} onClick={create}>
            التالي: المشاركون
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
