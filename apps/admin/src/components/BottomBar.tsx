import { Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { t } from "../i18n/ar";
import { HelpBadge } from "./HelpBadge";
import { NAV, navPath, PHONE_TABS } from "./nav";

const TAB =
  "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]";

/** The bar on a phone: the four main pages, and the rest behind "المزيد". */
export function BottomBar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const active = navPath(pathname);
  const items = NAV.flatMap((group) => group.items);
  const tabs = PHONE_TABS.map((to) => items.find((item) => item.to === to)!);
  const inMore = active !== undefined && !PHONE_TABS.includes(active);
  return (
    <nav
      aria-label={t.shell.navLabel}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.to === "/"}
              className={cn(
                TAB,
                active === tab.to
                  ? "font-medium text-primary"
                  : "text-muted-foreground",
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
              {tab.to === "/help" && (
                <HelpBadge className="absolute end-3 top-1.5" />
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            data-active={inMore}
            onClick={() => setOpenMobile(true)}
            className={cn(
              TAB,
              inMore ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-5" />
            {t.shell.more}
          </button>
        </li>
      </ul>
    </nav>
  );
}
