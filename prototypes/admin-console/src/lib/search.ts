import { ago, date, settingText } from "./format";
import type { Db, Route } from "./types";

export type SearchKind = "person" | "khatma" | "help" | "setting" | "message" | "audit" | "admin" | "page";

export const KIND_LABEL: Record<SearchKind, string> = {
  person: "الأشخاص",
  khatma: "الختمات",
  help: "طلبات المساعدة",
  setting: "الإعدادات",
  message: "رسائل واتساب",
  audit: "سجل التغييرات",
  admin: "الفريق",
  page: "الصفحات",
};

const PAGES: { page: Route["page"]; label: string; words: string }[] = [
  { page: "overview", label: "نظرة عامة", words: "الرئيسية overview home" },
  { page: "help", label: "طلبات المساعدة", words: "دعم support inbox" },
  { page: "people", label: "الأشخاص", words: "المنظمون الأعضاء people users" },
  { page: "khatmas", label: "الختمات", words: "khatma" },
  { page: "messages", label: "رسائل واتساب", words: "whatsapp" },
  { page: "settings", label: "الإعدادات", words: "settings" },
  { page: "team", label: "الفريق والأدوار", words: "المشرفون الصلاحيات admins roles team" },
  { page: "agent", label: "المساعد وClaude", words: "mcp ai agent ذكاء" },
  { page: "audit", label: "سجل التغييرات", words: "audit log" },
];

/** English and everyday words, mapped to the Arabic the data uses. */
const SYNONYMS: Record<string, string[]> = {
  blocked: ["محظور"],
  ban: ["محظور", "حظر"],
  banned: ["محظور"],
  organizer: ["منظم"],
  organiser: ["منظم"],
  member: ["عضو"],
  user: ["عضو", "شخص"],
  invited: ["مدعو"],
  admin: ["مشرف"],
  owner: ["مالك"],
  archived: ["مؤرشفه"],
  paused: ["موقوفه"],
  rota: ["بالتناوب", "تناوب"],
  rotating: ["بالتناوب", "تناوب"],
  pool: ["بالحجز", "حجز"],
  failed: ["فشلت"],
  whatsapp: ["واتساب"],
  maintenance: ["صيانه"],
  reminder: ["تذكير"],
  grace: ["مهله"],
  quiet: ["هدوء"],
  limit: ["حد", "اقصي"],
  delete: ["حذف"],
  open: ["مفتوح"],
  closed: ["مغلق"],
  password: ["رمز"],
  code: ["رمز"],
  pin: ["رمز"],
};

/** Lowercased, Arabic digits made Latin, marks removed, and letter forms folded. */
export function fold(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

/** A phone reduced to what people actually type: no +, 00, 0, or 971. */
function phoneDigits(text: string): string {
  return fold(text).replace(/\D/g, "").replace(/^00/, "").replace(/^971/, "").replace(/^0/, "");
}

function withinEdits(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const value = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      next.push(value);
      best = Math.min(best, value);
    }
    if (best > limit) return false;
    row = next;
  }
  return row[b.length] <= limit;
}

export type SearchEntry = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  route: Route;
  /** Folded words of the name; a match here counts most. */
  primary: string[];
  secondary: string[];
  phone?: string;
  /** Small nudge so urgent rows lead on a tie. */
  boost?: number;
};

function words(text: string): string[] {
  return fold(text).split(/[\s،,.:·/()«»_-]+/).filter(Boolean);
}

/** One list of everything an admin can look for. `phones` is false for roles that can't see numbers. */
export function buildIndex(db: Db, phones: boolean, show: (phone: string) => string): SearchEntry[] {
  const out: SearchEntry[] = [];
  const person = (id: string | null) => db.people.find((p) => p.id === id);

  for (const p of db.people) {
    const organizes = db.khatmas.filter((k) => k.organizerId === p.id);
    const inKhatma = db.khatmas.some((k) => k.members.some((m) => m.personId === p.id && m.status === "active"));
    const role = organizes.length > 0 ? "منظم" : inKhatma ? "عضو" : "بلا ختمه";
    const status = { active: "نشط", blocked: "محظور", invited: "مدعو" }[p.status];
    out.push({
      kind: "person",
      id: p.id,
      title: p.name,
      subtitle: `${role === "منظم" ? "منظّم" : role === "عضو" ? "عضو" : "بلا ختمة"} · ${status}`,
      route: { page: "person", id: p.id },
      primary: words(p.name),
      secondary: words(`${role} ${status} ${p.timeZone} ${p.adminNote}`),
      phone: phones ? phoneDigits(p.phone) : undefined,
      boost: 2,
    });
  }

  for (const k of db.khatmas) {
    const organizer = person(k.organizerId);
    const kind = k.kind === "rota" ? "بالتناوب" : "بالحجز";
    const status = { active: "نشطة", paused: "موقوفة", archived: "مؤرشفة" }[k.status];
    out.push({
      kind: "khatma",
      id: k.id,
      title: k.name,
      subtitle: `${kind} · ${status} · ${organizer?.name ?? "—"}`,
      route: { page: "khatma", id: k.id },
      primary: [...words(k.name), fold(k.inviteCode)],
      secondary: words(`${kind} ${status} ${k.schedule} ${organizer?.name ?? ""}`),
      boost: 1,
    });
  }

  for (const k of db.khatmas) {
    for (const p of k.rota?.participants ?? []) {
      if (p.personId !== null) continue;
      out.push({
        kind: "khatma",
        id: `${k.id}-${p.id}`,
        title: p.name,
        subtitle: `مشارك على واتساب · ${k.name}`,
        route: { page: "khatma", id: k.id },
        primary: words(p.name),
        secondary: words(`مشارك ${k.name}`),
        phone: phones ? phoneDigits(p.phone) : undefined,
      });
    }
  }

  for (const h of db.help) {
    const name = h.visitorName ?? person(h.personId)?.name ?? "حساب محذوف";
    const status = { open: "مفتوح", answered: "مُجاب", closed: "مغلق" }[h.status];
    out.push({
      kind: "help",
      id: h.id,
      title: h.messages[0].text,
      subtitle: `${name} · ${status} · ${ago(h.lastMessageAt)}`,
      route: { page: "help", id: h.id },
      primary: words(name),
      secondary: words(`${h.messages.map((m) => m.text).join(" ")} ${status}`),
      boost: h.status === "open" ? 4 : 0,
    });
  }

  for (const s of db.settings) {
    out.push({
      kind: "setting",
      id: s.key,
      title: s.label,
      subtitle: `${settingText(s.spec, s.value)} · ${s.sectionLabel}`,
      route: { page: "settings", key: s.key },
      primary: words(s.label),
      secondary: [...words(`${s.what} ${s.why} ${s.sectionLabel}`), fold(s.key)],
    });
  }

  for (const m of db.messages) {
    const status = { delivered: "وصلت", read: "قرئت", failed: "فشلت", skipped: "تخطيت" }[m.status];
    const name = person(m.personId)?.name ?? "حساب محذوف";
    out.push({
      kind: "message",
      id: m.id,
      title: `${m.template} · ${name}`,
      subtitle: `${status}${m.reason ? ` · ${m.reason}` : ""} · ${ago(m.at)}`,
      route: { page: "person", id: m.personId },
      primary: words(m.template),
      secondary: words(`${name} ${status} ${m.reason ?? ""}`),
      boost: m.status === "failed" ? 3 : -2,
    });
  }

  for (const a of db.audit) {
    out.push({
      kind: "audit",
      id: a.id,
      title: `${a.action} · ${a.targetLabel}`,
      subtitle: `${a.actor} · ${date(a.at)}`,
      route: { page: "audit", id: a.id },
      primary: words(a.action),
      secondary: words(`${a.targetLabel} ${a.actor} ${a.note ?? ""} ${a.before ?? ""} ${a.after ?? ""}`),
    });
  }

  for (const a of db.admins) {
    out.push({
      kind: "admin",
      id: a.id,
      title: a.name,
      subtitle: `مشرف · ${show(a.phone)}`,
      route: { page: "team" },
      primary: words(a.name),
      secondary: words(`مشرف ${a.role === "owner" ? "مالك" : a.role === "support" ? "دعم" : "مشاهد"}`),
      phone: phones ? phoneDigits(a.phone) : undefined,
    });
  }

  for (const p of PAGES) {
    out.push({
      kind: "page",
      id: p.page,
      title: p.label,
      subtitle: "صفحة",
      route: { page: p.page } as Route,
      primary: words(p.label),
      secondary: words(p.words),
    });
  }
  return out;
}

function wordScore(token: string, list: string[], fuzzy: boolean): number {
  let best = 0;
  for (const word of list) {
    if (word === token) return 100;
    if (word.startsWith(token)) best = Math.max(best, 80);
    else if (token.length >= 2 && word.includes(token)) best = Math.max(best, 60);
    else if (!fuzzy) continue;
    else if (token.length >= 4 && withinEdits(token, word, token.length >= 7 ? 2 : 1)) best = Math.max(best, 40);
    else if (token.length >= 5 && word.length > token.length && withinEdits(token, word.slice(0, token.length), 1)) {
      best = Math.max(best, 30);
    }
  }
  return best;
}

function tokenScore(token: string, entry: SearchEntry, fuzzy: boolean): number {
  const digits = token.replace(/\D/g, "");
  if (entry.phone && digits.length >= 3 && digits.length === token.replace(/\+/g, "").length) {
    const wanted = phoneDigits(token);
    if (wanted && entry.phone.includes(wanted)) return 120;
  }
  const alternatives = [token, ...(SYNONYMS[token] ?? [])];
  let best = 0;
  for (const alt of alternatives) {
    best = Math.max(best, wordScore(alt, entry.primary, fuzzy), wordScore(alt, entry.secondary, fuzzy) * 0.5);
  }
  return best;
}

export type SearchHit = SearchEntry & { score: number };

function pass(index: SearchEntry[], tokens: string[], fuzzy: boolean): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const entry of index) {
    let total = 0;
    for (const token of tokens) {
      const score = tokenScore(token, entry, fuzzy);
      if (score === 0) {
        total = 0;
        break;
      }
      total += score;
    }
    if (total > 0) hits.push({ ...entry, score: total + (entry.boost ?? 0) });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/**
 * Every word must match somewhere, and names beat descriptions. Typos only
 * count when real matches are scarce, so they never bury an exact result.
 */
const KIND_PAGE: Record<SearchKind, Route["page"] | null> = {
  person: "people",
  khatma: "khatmas",
  help: "help",
  setting: "settings",
  message: "messages",
  audit: "audit",
  admin: "team",
  page: null,
};

/** Drops what this role's pages don't show, so search never goes around them. */
export function forRole(index: SearchEntry[], canPage: (page: Route["page"]) => boolean): SearchEntry[] {
  return index.filter((entry) => canPage(KIND_PAGE[entry.kind] ?? entry.route.page));
}

export function search(index: SearchEntry[], query: string): SearchHit[] {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const exact = pass(index, tokens, false);
  return exact.length >= 3 ? exact : pass(index, tokens, true);
}
