import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Send, Sparkles, Square, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ACTIONS, runAction } from "@/lib/actions";
import { buildTools, getSample, rules, type Proposal, type SampleError } from "@/lib/agent";
import { closeAgent, useAgent, useRoute } from "@/lib/store";
import { cn } from "@/lib/utils";

type Card = Proposal & { id: string; state: "waiting" | "done" | "declined" | "failed" };

type Item =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "run"; text: string; activity: string[]; cards: Card[]; busy: boolean; error?: string };

type Turn = { role: "user" | "assistant"; content: string };

const ERRORS: Record<string, string> = {
  not_granted: "لم تسمح لهذه الصفحة باستخدام Claude.",
  sampling_disabled: "Claude غير متاح لهذا الحساب.",
  tools_unavailable: "هذا العرض لا يدعم أدوات المساعد.",
  rate_limited: "وصلت إلى حد الاستخدام. جرّب بعد قليل.",
  session_expired: "انتهت جلستك في Claude. سجّل الدخول من جديد.",
  refused: "لم يستطع Claude الرد على هذا الطلب. غيّر الصياغة.",
  empty_completion: "لم يصل رد. جرّب سؤالاً أبسط.",
};

const MAX_TURNS = 14;

function suggestions(page: string): string[] {
  if (page === "person") return ["لخّص حالة هذا الشخص", "هل فشلت له رسائل؟", "ماذا قرأ مؤخراً؟"];
  if (page === "khatma") return ["لخّص هذه الختمة", "هل منظّمها غائب؟"];
  if (page === "help") return ["لخّص هذا الطلب واقترح رداً"];
  if (page === "settings") return ["ما الإعدادات المعدّلة؟", "ما ساعات الهدوء الحالية؟"];
  return ["ما الذي يحتاج انتباهي اليوم؟", "ما أقدم طلب مساعدة مفتوح؟", "لماذا فشلت الرسائل مؤخراً؟"];
}

export function AgentPanel() {
  const agent = useAgent();
  const route = useRoute();
  const [items, setItems] = useState<Item[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const turns = useRef<Turn[]>([]);
  const control = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const handled = useRef(0);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items]);

  const patchRun = (id: string, patch: (run: Extract<Item, { type: "run" }>) => Partial<Extract<Item, { type: "run" }>>) =>
    setItems((list) => list.map((item) => (item.id === id && item.type === "run" ? { ...item, ...patch(item) } : item)));

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setDraft("");
    setNotice(null);
    const sample = await getSample();
    if (!sample) {
      setNotice("المساعد يعمل في الرابط المنشور داخل Claude، لأنه يستخدم حسابك في Claude. هنا يمكنك رؤية شكله فقط.");
      return;
    }
    const runId = `run${Date.now()}`;
    const log: string[] = [];
    setItems((list) => [
      ...list,
      { id: `${runId}u`, type: "user", text: question },
      { id: runId, type: "run", text: "", activity: [], cards: [], busy: true },
    ]);
    turns.current.push({ role: "user", content: question });
    setBusy(true);
    const ctl = new AbortController();
    control.current = ctl;
    const tools = buildTools({
      activity: (line) => {
        log.push(line);
        patchRun(runId, (run) => ({ activity: [...run.activity, line] }));
      },
      propose: (proposal) => {
        const card: Card = { ...proposal, id: `${runId}${Math.random()}`, state: "waiting" };
        log.push(`proposed: ${proposal.summary}`);
        patchRun(runId, (run) => ({ cards: [...run.cards, card] }));
      },
    });
    try {
      const { text: answer, truncated } = await sample(
        [{ role: "user", content: rules() }, ...turns.current.slice(-MAX_TURNS)],
        { tools, modelTier: "quick", signal: ctl.signal, onText: ({ text: t }) => patchRun(runId, () => ({ text: t })) },
      );
      turns.current.push({ role: "assistant", content: log.length ? `${answer}\n\n[Tools used: ${log.join("; ")}]` : answer });
      patchRun(runId, () => ({ text: answer, busy: false, error: truncated ? "انقطع الرد. اطلب أقل في المرة القادمة." : undefined }));
    } catch (caught) {
      const e = caught as SampleError;
      patchRun(runId, (run) => ({
        text: e.code === "refused" ? "" : (e.text ?? run.text),
        busy: false,
        error: e.code === "cancelled" ? undefined : (ERRORS[e.code] ?? "تعذر الوصول إلى Claude. جرّب مرة أخرى."),
      }));
      turns.current.pop();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (agent.ask && agent.nonce !== handled.current) {
      handled.current = agent.nonce;
      void send(agent.ask);
    }
  }, [agent.nonce]);

  const decide = (runId: string, card: Card, approve: boolean) => {
    let state: Card["state"] = "declined";
    if (approve) {
      try {
        runAction(card.kind, card.args, "agent");
        state = "done";
        toast.success("نُفّذ، وسُجّل في سجل التغييرات");
      } catch {
        state = "failed";
      }
    }
    patchRun(runId, (run) => ({ cards: run.cards.map((c) => (c.id === card.id ? { ...c, state } : c)) }));
    turns.current.push({
      role: "user",
      content: `[Panel note: the admin ${state === "done" ? "approved and it ran" : state === "failed" ? "approved but it failed" : "declined"}: ${card.summary}]`,
    });
  };

  if (!agent.open) return null;

  return (
    <aside
      aria-label="المساعد"
      className="fixed inset-0 z-40 flex flex-col bg-card pt-[env(safe-area-inset-top)] md:sticky md:top-14 md:z-10 md:h-[calc(100svh-3.5rem)] md:w-[380px] md:shrink-0 md:border-s md:pt-0"
    >
      <header className="flex h-12 items-center gap-2 border-b px-3">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-[13px] font-medium">المساعد</h2>
        <span className="ms-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="محادثة جديدة"
            disabled={busy}
            onClick={() => {
              setItems([]);
              turns.current = [];
            }}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="إغلاق" onClick={closeAgent}>
            <X className="size-4" />
          </Button>
        </span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {items.length === 0 && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">
              يبحث ويقرأ ويقترح. لا يغيّر شيئاً إلا بعد موافقتك، وكل ما ينفذه يُسجَّل باسمك.
            </p>
            {suggestions(route.page).map((text) => (
              <button key={text} type="button" onClick={() => void send(text)} className="block w-full rounded-md border px-2.5 py-1.5 text-start text-[13px] hover:bg-accent">
                {text}
              </button>
            ))}
          </div>
        )}
        {items.map((item) =>
          item.type === "user" ? (
            <div key={item.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-[13px] whitespace-pre-wrap text-primary-foreground">{item.text}</p>
            </div>
          ) : (
            <div key={item.id} className="space-y-2">
              {item.activity.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {item.activity.map((line, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Wrench className="size-3 shrink-0" /> {line}
                    </li>
                  ))}
                </ul>
              )}
              {item.busy && !item.text && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> يفكر...
                </p>
              )}
              {item.text && <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{item.text}</p>}
              {item.cards.map((card) => (
                <div key={card.id} className="rounded-lg border bg-background p-2.5 text-[13px]">
                  <p className="text-xs text-muted-foreground">{ACTIONS[card.kind].label}</p>
                  <p className="font-medium">{card.summary}</p>
                  {card.args.note && <p className="text-xs text-muted-foreground">السبب: {card.args.note}</p>}
                  {card.state === "waiting" ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="h-7" onClick={() => decide(item.id, card, true)}>
                        <Check /> تأكيد
                      </Button>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => decide(item.id, card, false)}>
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <p className={cn("mt-1 text-xs", card.state === "done" ? "text-good" : "text-muted-foreground")}>
                      {card.state === "done" ? "نُفّذ، وسُجّل في سجل التغييرات." : card.state === "failed" ? "تعذر التنفيذ." : "أُلغي، ولم يتغير شيء."}
                    </p>
                  )}
                </div>
              ))}
              {item.error && (
                <p role="alert" className="text-xs text-destructive">
                  {item.error}
                </p>
              )}
            </div>
          ),
        )}
        {notice && <p className="rounded-md bg-info-soft px-2.5 py-2 text-xs text-info">{notice}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="border-t p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          void send(draft);
        }}
      >
        <Textarea
          id="agent-input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(draft);
            }
          }}
          placeholder="اطلب أي شيء، مثل: من المنظمون الغائبون؟"
          className="resize-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">بيانات تجريبية · يستخدم حسابك في Claude</span>
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={() => control.current?.abort()}>
              <Square /> إيقاف
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              <Send className="rtl:-scale-x-100" /> إرسال
            </Button>
          )}
        </div>
      </form>
    </aside>
  );
}
