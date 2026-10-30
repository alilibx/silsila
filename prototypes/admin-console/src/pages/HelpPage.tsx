import { useState } from "react";
import { ArrowRight, Check, ExternalLink, Image, MessageSquarePlus, Mic, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Empty, PersonAvatar, Pill } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { ago, ar, dateTime, num } from "@/lib/format";
import { change, go, useCan, useDb, usePhone } from "@/lib/store";
import type { Db, HelpRequest, HelpStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SAVED_REPLIES = [
  { label: "خطوات رمز الدخول", text: "افتح واتساب وأرسل الرمز الظاهر على الشاشة إلى رقم وِردك، ثم عُد إلى الصفحة." },
  { label: "تغيير الرقم", text: "نقلنا حسابك إلى رقمك الجديد. ادخل به الآن وستجد ختماتك كما هي." },
  { label: "إعادة تفعيل الإشعارات", text: "من إعدادات الهاتف فعّل إشعارات وِردك، ثم افتح الموقع مرة واحدة ليعود التسجيل." },
  { label: "شكر وإغلاق", text: "تم حل الأمر بحمد الله. إن احتجت شيئاً فنحن هنا." },
];

function statusPill(status: HelpStatus) {
  if (status === "open") return <Pill tone="warn">مفتوح</Pill>;
  if (status === "answered") return <Pill tone="info">مُجاب</Pill>;
  return <Pill>مغلق</Pill>;
}

function patchHelp(db: Db, id: string, patch: Partial<HelpRequest>): Db {
  return { ...db, help: db.help.map((h) => (h.id === id ? { ...h, ...patch } : h)) };
}

function requesterName(db: Db, request: HelpRequest) {
  return request.visitorName ?? db.people.find((p) => p.id === request.personId)?.name ?? "حساب محذوف";
}

function Conversation({ request, onBack }: { request: HelpRequest; onBack?: () => void }) {
  const db = useDb();
  const can = useCan();
  const [reply, setReply] = useState("");
  const name = requesterName(db, request);
  const number = ar(request.id.slice(1));

  const send = () => {
    const text = reply.trim();
    if (!text) return;
    const at = Date.now();
    change((d) =>
      patchHelp(d, request.id, {
        status: "answered",
        lastMessageAt: at,
        messages: [...request.messages, { id: `m${at}`, from: "team", text, at }],
      }),
    );
    setReply("");
    toast.success("أُرسل الرد إلى الشخص");
  };

  const setStatus = (status: HelpStatus, action: string) => {
    change((d) => patchHelp(d, request.id, { status }), {
      action,
      targetKind: "help",
      targetId: request.id,
      targetLabel: `طلب #${number}`,
      before: request.status,
      after: status,
      note: null,
    });
    toast.success(action);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {onBack && (
          <Button variant="ghost" size="icon" className="size-8" aria-label="رجوع" onClick={onBack}>
            <ArrowRight className="size-4" />
          </Button>
        )}
        <div className="min-w-0">
          {request.personId ? (
            <button type="button" className="block max-w-full truncate text-[13px] font-medium underline-offset-2 hover:underline" onClick={() => go({ page: "person", id: request.personId! })}>
              {name}
            </button>
          ) : (
            <p className="truncate text-[13px] font-medium">{name}</p>
          )}
          <p className="text-xs text-muted-foreground">طلب #{number} · {dateTime(request.createdAt)}</p>
        </div>
        <span className="ms-auto flex items-center gap-1.5">
          {statusPill(request.status)}
          {can("help.reply") &&
            (request.status === "closed" ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus("open", "إعادة فتح طلب مساعدة")}>
                <RotateCcw /> إعادة فتح
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus("closed", "إغلاق طلب مساعدة")}>
                <Check /> إغلاق
              </Button>
            ))}
        </span>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {request.messages.map((message) => (
          <div key={message.id} className={cn("flex", message.from === "team" && "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                message.from === "team" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              <p>{message.text}</p>
              {message.attachment && (
                <p className="mt-1.5 flex items-center gap-1 rounded bg-background/60 px-1.5 py-1 text-xs text-foreground">
                  {message.attachment === "voice" ? <Mic className="size-3" /> : <Image className="size-3" />}
                  {message.attachment === "voice" ? "تسجيل صوتي" : "لقطة شاشة"}
                </p>
              )}
              <p className="mt-1 text-[11px] opacity-70">
                {message.from === "team" ? "فريق وِردك · " : ""}
                {ago(message.at)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {can("help.reply") ? (
        <div className="border-t p-2.5">
          <Textarea
            id="help-reply"
            rows={2}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="اكتب رداً. يصل باسم فريق وِردك."
            className="resize-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MessageSquarePlus /> ردود جاهزة
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                {SAVED_REPLIES.map((saved) => (
                  <DropdownMenuItem key={saved.label} onSelect={() => setReply(saved.text)}>
                    {saved.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" disabled={!reply.trim()} onClick={send}>
              <Send className="rtl:-scale-x-100" /> إرسال
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t p-3 text-center text-xs text-muted-foreground">دورك الحالي لا يسمح بالرد.</p>
      )}
    </div>
  );
}

function ContextPanel({ request }: { request: HelpRequest }) {
  const db = useDb();
  const phone = usePhone();
  const person = db.people.find((p) => p.id === request.personId);
  const khatma = db.khatmas.find((k) => k.id === request.khatmaId);
  const failed = person ? db.messages.filter((m) => m.personId === person.id && m.status === "failed").slice(0, 3) : [];

  return (
    <aside className="w-72 shrink-0 space-y-4 overflow-y-auto border-s p-3 text-[13px]">
      {person ? (
        <section>
          <div className="flex items-center gap-2">
            <PersonAvatar name={person.name} />
            <div className="min-w-0">
              <p className="truncate font-medium">{person.name}</p>
              <p className="ltr-text text-end text-xs text-muted-foreground">{phone(person.phone)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => go({ page: "person", id: person.id })}>
            <ExternalLink /> افتح الحساب
          </Button>
          <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">آخر ظهور</dt>
            <dd>{ago(person.lastSeenAt)}</dd>
            <dt className="text-muted-foreground">الأجهزة</dt>
            <dd>{num(person.devices.length)}</dd>
            <dt className="text-muted-foreground">الحالة</dt>
            <dd>{person.status === "blocked" ? "محظور" : "نشط"}</dd>
          </dl>
        </section>
      ) : (
        <p className="text-muted-foreground">زائر لم يسجل دخوله، فلا يوجد حساب مرتبط.</p>
      )}

      {khatma && (
        <section>
          <h3 className="mb-1 text-xs text-muted-foreground">الختمة</h3>
          <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => go({ page: "khatma", id: khatma.id })}>
            {khatma.name}
          </button>
        </section>
      )}

      {failed.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs text-muted-foreground">رسائل فشلت له</h3>
          <ul className="space-y-1 text-xs">
            {failed.map((m) => (
              <li key={m.id}>
                {m.template}: <span className="text-muted-foreground">{m.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 text-xs text-muted-foreground">جهاز الطلب</h3>
        <dl className="grid grid-cols-2 gap-y-1 text-xs">
          <dt className="text-muted-foreground">الجهاز</dt>
          <dd>{request.context.device}</dd>
          <dt className="text-muted-foreground">الصفحة</dt>
          <dd className="ltr-text text-end">{request.context.path}</dd>
          <dt className="text-muted-foreground">الإصدار</dt>
          <dd className="ltr-text text-end">{request.context.appVersion}</dd>
        </dl>
      </section>
    </aside>
  );
}

export function HelpPage({ id }: { id?: string }) {
  const db = useDb();
  const mobile = useIsMobile();
  const [status, setStatus] = useState<HelpStatus | "all">("open");

  const rows = db.help
    .filter((h) => status === "all" || h.status === status)
    .sort((a, b) => (status === "open" ? a.lastMessageAt - b.lastMessageAt : b.lastMessageAt - a.lastMessageAt));
  const selected = db.help.find((h) => h.id === id) ?? (mobile ? undefined : rows[0]);
  const counts = (s: HelpStatus) => db.help.filter((h) => h.status === s).length;

  const list = (
    <div className="flex min-h-0 flex-col md:w-80 md:shrink-0 md:border-e">
      <div className="border-b p-2">
        <Tabs dir="rtl" value={status} onValueChange={(v) => setStatus(v as HelpStatus | "all")}>
          <TabsList className="grid h-8 w-full grid-cols-4">
            <TabsTrigger value="open" className="text-xs">مفتوح {num(counts("open"))}</TabsTrigger>
            <TabsTrigger value="answered" className="text-xs">مُجاب</TabsTrigger>
            <TabsTrigger value="closed" className="text-xs">مغلق</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">الكل</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ul className="flex-1 divide-y overflow-y-auto">
        {rows.length === 0 && <Empty title="لا توجد طلبات هنا" hint="عمل جيد." />}
        {rows.map((request) => (
          <li key={request.id}>
            <button
              type="button"
              onClick={() => go({ page: "help", id: request.id })}
              className={cn(
                "block w-full px-3 py-2.5 text-start hover:bg-accent",
                selected?.id === request.id && !mobile && "bg-accent",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate font-medium">{requesterName(db, request)}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(request.lastMessageAt)}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{request.messages[0].text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  if (mobile) {
    return (
      <div className="-mx-4 -mt-4 flex h-[calc(100svh-7.5rem)] flex-col bg-card">
        {selected ? <Conversation key={selected.id} request={selected} onBack={() => go({ page: "help" })} /> : list}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-6.5rem)] overflow-hidden rounded-lg border bg-card">
      {list}
      {selected ? (
        <>
          <Conversation key={selected.id} request={selected} />
          <div className="hidden xl:flex">
            <ContextPanel request={selected} />
          </div>
        </>
      ) : (
        <div className="flex-1">
          <Empty title="اختر طلباً" />
        </div>
      )}
    </div>
  );
}
