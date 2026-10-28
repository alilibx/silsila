import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link, matchPath, useLocation } from "react-router";
import { useBottomBarHidden } from "../features/nav/bottomBarUi";
import { t } from "../i18n/ar";
import { useSessionToken } from "../lib/session";
import { useClearDeadToken } from "../lib/useClearDeadToken";

type Item = "home" | "create" | "settings";

function activeItem(pathname: string): Item | null {
  if (pathname === "/" || matchPath("/j/:inviteCode", pathname)) return "home";
  if (pathname === "/new") return "create";
  if (pathname === "/settings") return "settings";
  return null;
}

/** Sub-screens with their own back link, and the sign-out page, have no bar. */
function hiddenOn(pathname: string): boolean {
  return (
    pathname === "/signout" ||
    matchPath("/j/:inviteCode/settings", pathname) !== null
  );
}

const icon = {
  width: 26,
  height: 26,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const ICONS: Record<Item, ReactNode> = {
  home: (
    <svg {...icon}>
      <path d="M12 6.5C10.2 5 7.6 4.5 4 4.5v14c3.6 0 6.2.5 8 2 1.8-1.5 4.4-2 8-2v-14c-3.6 0-6.2.5-8 2Z" />
      <path d="M12 6.5v14" />
    </svg>
  ),
  create: (
    <svg {...icon}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  settings: (
    <svg {...icon}>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.75 20c.9-3.6 3.7-5.5 7.25-5.5s6.35 1.9 7.25 5.5" />
    </svg>
  ),
};

/**
 * The app's bottom bar (navigation spec 3): three labelled links, only for a signed-in person.
 * Its measured height is published as `--nav-h`, which the page padding and the toast read.
 */
export function BottomBar() {
  const sessionToken = useSessionToken();
  const me = useQuery(api.sessions.me, { sessionToken });
  const mine = useQuery(api.khatmas.mine, { sessionToken });
  // A stored token the server answers as signed out is dead. Clearing it here covers every page,
  // including /new, which would otherwise hide its back link and show no bar either.
  useClearDeadToken(sessionToken, me === null);
  const hidden = useBottomBarHidden();
  const { pathname } = useLocation();

  if (hidden || !me || hiddenOn(pathname)) return null;
  const active = activeItem(pathname);
  const hasNote = mine?.some((k) => k.hasNote) ?? false;

  return (
    <Bar>
      <BarLink item="home" to="/" active={active} dot={hasNote}>
        {t.nav.home}
      </BarLink>
      <BarLink item="create" to="/new" active={active}>
        {t.nav.create}
      </BarLink>
      <BarLink item="settings" to="/settings" active={active}>
        {t.nav.settings}
      </BarLink>
    </Bar>
  );
}

function Bar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const root = document.documentElement.style;
    const measure = () =>
      root.setProperty(
        "--nav-h",
        `${Math.ceil(nav.getBoundingClientRect().height)}px`,
      );
    // Older browsers without ResizeObserver measure once; the height only changes with text size.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(nav);
    measure();
    return () => {
      observer?.disconnect();
      root.removeProperty("--nav-h");
    };
  }, []);

  return (
    <nav
      ref={ref}
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-xl">{children}</div>
    </nav>
  );
}

function BarLink({
  item,
  to,
  active,
  dot = false,
  children,
}: {
  item: Item;
  to: string;
  active: Item | null;
  dot?: boolean;
  children: string;
}) {
  const isActive = active === item;
  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      aria-label={
        dot
          ? `${children}${t.common.listSeparator}${t.notes.newMessage}`
          : undefined
      }
      className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-center leading-tight [overflow-wrap:anywhere] ${
        isActive ? "font-semibold text-green" : "text-ink-soft"
      }`}
    >
      <span className="relative">
        {ICONS[item]}
        {dot && (
          <span
            aria-hidden="true"
            className="absolute -end-1 -top-0.5 size-3 rounded-full border-2 border-card bg-saffron"
          />
        )}
      </span>
      {children}
    </Link>
  );
}
