import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-balance">{title}</h1>
        {description && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-good-soft text-good",
  warn: "bg-saffron-soft text-saffron-ink",
  bad: "bg-bad-soft text-destructive",
  info: "bg-info-soft text-info",
};

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function PersonAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard?.writeText(value).catch(() => undefined);
        setDone(true);
        toast.success("نُسخ");
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[13px]">{label}</Label>
      {children}
    </div>
  );
}

export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-y-2.5 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="-mt-2 min-w-0 sm:mt-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

type Ask = {
  title: string;
  body: string;
  confirm: string;
  destructive?: boolean;
  /** The admin types this exact text before the button turns on. */
  typeToConfirm?: string;
  /** Asks for a reason, which goes into the audit log. */
  note?: boolean;
  onConfirm: (note: string | null) => void;
};

let current: Ask | null = null;
const listeners = new Set<() => void>();

function setAsk(next: Ask | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

/** Opens the one confirmation dialog the app keeps mounted. */
export function ask(next: Ask) {
  setAsk(next);
}

export function ConfirmHost() {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const blocked = value?.typeToConfirm !== undefined && typed !== value.typeToConfirm;

  return (
    <AlertDialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAsk(null);
          setTyped("");
          setNote("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{value?.title}</AlertDialogTitle>
          <AlertDialogDescription>{value?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        {value?.note && (
          <Field label="السبب (يُحفظ في سجل التغييرات)">
            <Textarea id="confirm-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {value?.typeToConfirm && (
          <Field label={`اكتب «${value.typeToConfirm}» للتأكيد`}>
            <Input id="confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            variant={value?.destructive ? "destructive" : "default"}
            onClick={() => value?.onConfirm(note.trim() || null)}
          >
            {value?.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
