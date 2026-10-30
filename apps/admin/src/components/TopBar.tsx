import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { t } from "../i18n/ar";
import { useTheme } from "../lib/theme";
import { NAV, navPath } from "./nav";

export function TopBar({ actions }: { actions?: ReactNode }) {
  const { pathname } = useLocation();
  const mobile = useIsMobile();
  const theme = useTheme();
  const active = navPath(pathname);
  const title = NAV.flatMap((group) => group.items).find(
    (item) => item.to === active,
  )?.label;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-5">
      {mobile ? (
        <span className="font-display text-xl text-primary">{t.app.name}</span>
      ) : (
        <>
          <SidebarTrigger />
          <span className="text-[13px] text-muted-foreground">{title}</span>
        </>
      )}
      <div className="ms-auto flex items-center gap-2">
        {actions}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.shell.toggleTheme}
          onClick={theme.toggle}
        >
          {theme.dark ? <Sun /> : <Moon />}
        </Button>
      </div>
    </header>
  );
}
