import {
  ClipboardList,
  Home,
  LifeBuoy,
  Search,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { t } from "../i18n/ar";

export type NavItem = { to: string; label: string; icon: LucideIcon };

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: t.shell.groups.daily,
    items: [
      { to: "/", label: t.nav.home, icon: Home },
      { to: "/help", label: t.nav.help, icon: LifeBuoy },
    ],
  },
  {
    label: t.shell.groups.people,
    items: [
      { to: "/search", label: t.nav.search, icon: Search },
      { to: "/organizers", label: t.nav.organizers, icon: Users },
    ],
  },
  {
    label: t.shell.groups.system,
    items: [
      { to: "/settings", label: t.nav.settings, icon: Settings },
      { to: "/audit", label: t.nav.audit, icon: ClipboardList },
      { to: "/admins", label: t.nav.admins, icon: ShieldCheck },
    ],
  },
];

/** The bar on a phone; the other pages sit behind "المزيد". */
export const PHONE_TABS = ["/", "/help", "/search", "/organizers"];

/** Pages with no tab of their own belong to the page you reach them from. */
const PARENT: [string, string][] = [
  ["/people", "/search"],
  ["/khatmas", "/search"],
  ["/rota", "/organizers"],
];

/** The nav entry a path belongs to, or undefined for an unknown path. */
export function navPath(pathname: string): string | undefined {
  if (pathname === "/") return "/";
  const parent = PARENT.find(([prefix]) => pathname.startsWith(prefix));
  if (parent) return parent[1];
  return NAV.flatMap((group) => group.items)
    .map((item) => item.to)
    .find((to) => to !== "/" && pathname.startsWith(to));
}
