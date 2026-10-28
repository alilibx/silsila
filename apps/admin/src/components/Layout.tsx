import { NavLink, Outlet } from "react-router";
import { t } from "../i18n/ar";

const NAV = [
  { to: "/", label: t.nav.home },
  { to: "/settings", label: t.nav.settings },
  { to: "/audit", label: t.nav.audit },
  { to: "/admins", label: t.nav.admins },
] as const;

/** The signed-in frame: header, the page, and the bottom nav (phone first, spec 4.1). */
export function Layout({ actions }: { actions?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-2xl text-green">{t.app.name}</span>
          <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-white">
            {t.badge}
          </span>
        </div>
        {actions}
      </header>
      <main className="flex-1 px-4 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-3xl justify-around">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `block px-3 py-3 text-sm ${isActive ? "font-semibold text-green" : "text-ink-soft"}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
