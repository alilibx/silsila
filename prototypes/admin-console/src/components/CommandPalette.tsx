import { useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  CornerDownLeft,
  FileText,
  LifeBuoy,
  MessageCircle,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { num } from "@/lib/format";
import { buildIndex, forRole, KIND_LABEL, search, type SearchEntry, type SearchHit, type SearchKind } from "@/lib/search";
import { go, openAgent, useCan, useCanPage, useDb, usePhone } from "@/lib/store";
import { cn } from "@/lib/utils";

const ICONS: Record<SearchKind, typeof User> = {
  person: User,
  khatma: BookOpen,
  help: LifeBuoy,
  setting: Settings,
  message: MessageCircle,
  audit: ClipboardList,
  admin: ShieldCheck,
  page: FileText,
};

const ORDER: SearchKind[] = ["person", "khatma", "help", "setting", "message", "audit", "admin", "page"];
const PER_GROUP = 4;
const PER_SCOPE = 40;

let recent: SearchEntry[] = [];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const db = useDb();
  const can = useCan();
  const phone = usePhone();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchKind | "all">("all");
  const canPhone = can("phone.view");

  const canPage = useCanPage();
  const index = useMemo(() => (open ? forRole(buildIndex(db, canPhone, phone), canPage) : []), [db, canPhone, open, canPage]);
  const hits = useMemo(() => search(index, query), [index, query]);
  const counts = useMemo(() => {
    const out = new Map<SearchKind, number>();
    hits.forEach((hit) => out.set(hit.kind, (out.get(hit.kind) ?? 0) + 1));
    return out;
  }, [hits]);
  const q = query.trim();

  const close = () => {
    onOpenChange(false);
    setQuery("");
    setScope("all");
  };

  const allowedRecent = recent.filter((entry) => canPage(entry.route.page));

  const pick = (entry: SearchEntry) => {
    recent = [entry, ...recent.filter((r) => r.id !== entry.id)].slice(0, 5);
    go(entry.route);
    close();
  };

  const groups: [SearchKind, SearchHit[]][] = ORDER.filter((kind) => scope === "all" || scope === kind)
    .map((kind): [SearchKind, SearchHit[]] => [
      kind,
      hits.filter((hit) => hit.kind === kind).slice(0, scope === "all" ? PER_GROUP : PER_SCOPE),
    ])
    .filter(([, list]) => list.length > 0);

  return (
    <Dialog open={open} onOpenChange={(value) => (value ? onOpenChange(true) : close())}>
      <DialogContent className="top-[8%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">بحث في كل شيء</DialogTitle>
        <DialogDescription className="sr-only">
          ابحث في الأشخاص والختمات والطلبات والإعدادات والرسائل والسجل
        </DialogDescription>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setScope("all");
            }}
            placeholder="اسم، رقم بأي صيغة، رمز دعوة، إعداد، نص رسالة..."
          />
          {q && (
            <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5 [scrollbar-width:none]">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-xs",
                  scope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                الكل {num(hits.length)}
              </button>
              {ORDER.filter((kind) => counts.has(kind)).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setScope(kind)}
                  className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 text-xs",
                    scope === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {KIND_LABEL[kind]} {num(counts.get(kind) ?? 0)}
                </button>
              ))}
            </div>
          )}
          <CommandList className="max-h-[62vh]">
            {!q && allowedRecent.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                جرّب «محظور»، أو «0556»، أو «ساعات الهدوء»، أو اسماً بخطأ إملائي.
              </p>
            )}
            {!q && allowedRecent.length > 0 && (
              <CommandGroup heading="فتحتها مؤخراً">
                {allowedRecent.map((entry) => {
                  const Icon = ICONS[entry.kind];
                  return (
                    <CommandItem key={entry.kind + entry.id} value={entry.kind + entry.id} onSelect={() => pick(entry)}>
                      <Icon />
                      <span className="truncate">{entry.title}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {q && hits.length === 0 && <CommandEmpty>لا نتيجة مباشرة.</CommandEmpty>}
            {groups.map(([kind, list]) => {
              const Icon = ICONS[kind];
              const more = (counts.get(kind) ?? 0) - list.length;
              return (
                <CommandGroup key={kind} heading={KIND_LABEL[kind]}>
                  {list.map((hit) => (
                    <CommandItem key={kind + hit.id} value={kind + hit.id} onSelect={() => pick(hit)}>
                      <Icon />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate">{hit.title}</span>
                        <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                      </span>
                    </CommandItem>
                  ))}
                  {more > 0 && (
                    <CommandItem value={`more-${kind}`} onSelect={() => setScope(kind)}>
                      <span className="text-xs text-primary">اعرض {num(more)} أخرى</span>
                    </CommandItem>
                  )}
                </CommandGroup>
              );
            })}
            {q && (
              <CommandGroup heading="لم تجد ما تريد؟">
                <CommandItem
                  value="ask-agent"
                  onSelect={() => {
                    openAgent(q);
                    close();
                  }}
                >
                  <Sparkles />
                  <span className="truncate">اسأل المساعد: {q}</span>
                  <CornerDownLeft className="ms-auto size-3.5 text-muted-foreground" />
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
