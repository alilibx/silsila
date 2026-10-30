import { useSyncExternalStore } from "react";
import { maskPhone } from "./format";
import { seed } from "./seed";
import type { AuditEntry, Db, Role, Route } from "./types";

type AgentState = { open: boolean; ask: string | null; nonce: number };
type State = { db: Db; role: Role; route: Route; agent: AgentState };

const TOP_PAGES = ["overview", "people", "khatmas", "help", "messages", "settings", "team", "audit", "agent"];

// "settings" is a hash the artifact viewer keeps for itself.
const toToken = (page: string) => (page === "settings" ? "config" : page);
const fromToken = (token: string) => (token === "config" ? "settings" : token);

function initialRoute(): Route {
  try {
    const page = fromToken(location.hash.slice(1));
    if (TOP_PAGES.includes(page)) return { page } as Route;
  } catch {
    // The hash is a convenience.
  }
  return { page: "overview" };
}

let state: State = {
  db: seed(),
  role: "owner",
  route: initialRoute(),
  agent: { open: false, ask: null, nonce: 0 },
};
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const useDb = () => useStore((s) => s.db);
export const useRole = () => useStore((s) => s.role);
export const useRoute = () => useStore((s) => s.route);
export const useAgent = () => useStore((s) => s.agent);
export const getDb = () => state.db;
export const getRole = () => state.role;
export const getRoute = () => state.route;

/** Opens the assistant; `ask` sends that question straight away. */
export function openAgent(ask?: string) {
  emit({ ...state, agent: { open: true, ask: ask ?? null, nonce: state.agent.nonce + 1 } });
}

export function closeAgent() {
  emit({ ...state, agent: { ...state.agent, open: false } });
}

export function go(route: Route) {
  emit({ ...state, route });
  window.scrollTo({ top: 0 });
  try {
    history.replaceState(null, "", TOP_PAGES.includes(route.page) ? `#${toToken(route.page)}` : " ");
  } catch {
    // The hash is a convenience.
  }
}

/** The pages each role can open. The real build checks this on the server too. */
export const PAGE_ACCESS: { page: Route["page"]; label: string; roles: Role[] }[] = [
  { page: "overview", label: "نظرة عامة", roles: ["owner", "support", "viewer"] },
  { page: "people", label: "الأشخاص", roles: ["owner", "support", "viewer"] },
  { page: "khatmas", label: "الختمات", roles: ["owner", "support", "viewer"] },
  { page: "help", label: "طلبات المساعدة", roles: ["owner", "support"] },
  { page: "messages", label: "رسائل واتساب", roles: ["owner", "support"] },
  { page: "audit", label: "سجل التغييرات", roles: ["owner", "support"] },
  { page: "settings", label: "الإعدادات", roles: ["owner"] },
  { page: "team", label: "الفريق والأدوار", roles: ["owner"] },
  { page: "agent", label: "المساعد وClaude", roles: ["owner"] },
];

const PARENT_PAGE: Partial<Record<Route["page"], Route["page"]>> = { person: "people", khatma: "khatmas" };

export function canPage(page: Route["page"], role: Role = state.role): boolean {
  const target = PARENT_PAGE[page] ?? page;
  return PAGE_ACCESS.find((p) => p.page === target)?.roles.includes(role) ?? false;
}

export function useCanPage() {
  const role = useRole();
  return (page: Route["page"]) => canPage(page, role);
}

export function setRole(role: Role) {
  emit({ ...state, role, route: canPage(state.route.page, role) ? state.route : { page: "overview" } });
}

export function resetData() {
  emit({ ...state, db: seed() });
}

const ACTOR: Record<Role, string> = {
  owner: "علي الهاشمي",
  support: "مريم الكعبي",
  viewer: "عمر الزعابي",
};

/** The real build writes the audit row in the same Convex mutation as the change. */
export function change(
  mutate: (db: Db) => Db,
  entry?: Omit<AuditEntry, "id" | "actor" | "at">,
  via?: AuditEntry["via"],
) {
  let db = mutate(state.db);
  if (entry) {
    const row: AuditEntry = {
      ...entry,
      via,
      id: `au${Date.now()}${Math.random()}`,
      actor: ACTOR[state.role],
      at: Date.now(),
    };
    db = { ...db, audit: [row, ...db.audit] };
  }
  emit({ ...state, db });
}

export type Permission =
  | "help.reply"
  | "person.edit"
  | "person.block"
  | "person.delete"
  | "khatma.edit"
  | "khatma.delete"
  | "data.export"
  | "settings.edit"
  | "team.manage"
  | "phone.view"
  | "reading.view";

export const PERMISSIONS: { key: Permission; label: string; roles: Role[] }[] = [
  { key: "help.reply", label: "الرد على طلبات المساعدة", roles: ["owner", "support"] },
  { key: "phone.view", label: "رؤية أرقام الهواتف كاملة", roles: ["owner", "support"] },
  { key: "reading.view", label: "رؤية قراءة شخص (يُسجَّل كل اطلاع)", roles: ["owner", "support"] },
  { key: "person.edit", label: "تعديل الأشخاص وإنهاء جلساتهم", roles: ["owner", "support"] },
  { key: "person.block", label: "حظر الأرقام ورفع الحظر", roles: ["owner", "support"] },
  { key: "khatma.edit", label: "تعديل الختمات وتسليم المنظّم", roles: ["owner", "support"] },
  { key: "data.export", label: "تصدير البيانات", roles: ["owner"] },
  { key: "person.delete", label: "حذف حساب نهائياً", roles: ["owner"] },
  { key: "khatma.delete", label: "حذف ختمة نهائياً", roles: ["owner"] },
  { key: "settings.edit", label: "تغيير الإعدادات", roles: ["owner"] },
  { key: "team.manage", label: "إدارة المشرفين والأدوار", roles: ["owner"] },
];

export const ROLE_LABEL: Record<Role, string> = {
  owner: "مالك",
  support: "دعم",
  viewer: "مشاهد",
};

export function canNow(permission: Permission, role: Role = state.role) {
  return PERMISSIONS.find((p) => p.key === permission)?.roles.includes(role) ?? false;
}

export function useCan() {
  const role = useRole();
  return (permission: Permission) => canNow(permission, role);
}

export function usePhone() {
  const can = useCan();
  return (phone: string) => (can("phone.view") ? phone : maskPhone(phone));
}
