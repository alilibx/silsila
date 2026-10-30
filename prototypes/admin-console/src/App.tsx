import { useEffect, useMemo, useState } from "react";
import { Direction } from "radix-ui";
import {
  ClipboardList,
  Home,
  LifeBuoy,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  BookOpen,
  Bot,
  Sparkles,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { AgentPanel } from "@/components/AgentPanel";
import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmHost, PersonAvatar } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { num } from "@/lib/format";
import { canPage, closeAgent, go, openAgent, resetData, ROLE_LABEL, setRole, useAgent, useCanPage, useDb, useRole, useRoute } from "@/lib/store";
import type { Role, Route } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AgentPage } from "@/pages/AgentPage";
import { AuditPage } from "@/pages/AuditPage";
import { HelpPage } from "@/pages/HelpPage";
import { KhatmaPage, KhatmasPage } from "@/pages/KhatmasPages";
import { MessagesPage } from "@/pages/MessagesPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { PeoplePage, PersonPage } from "@/pages/PeoplePages";
import { SettingsPage } from "@/pages/SettingsPage";
import { TeamPage } from "@/pages/TeamPage";

const NAV = [
  {
    label: "العمل اليومي",
    items: [
      { page: "overview", label: "نظرة عامة", icon: Home },
      { page: "help", label: "طلبات المساعدة", icon: LifeBuoy },
    ],
  },
  {
    label: "البيانات",
    items: [
      { page: "people", label: "الأشخاص", icon: Users },
      { page: "khatmas", label: "الختمات", icon: BookOpen },
      { page: "messages", label: "رسائل واتساب", icon: MessageCircle },
    ],
  },
  {
    label: "النظام",
    items: [
      { page: "settings", label: "الإعدادات", icon: Settings },
      { page: "team", label: "الفريق والأدوار", icon: ShieldCheck },
      { page: "agent", label: "المساعد وClaude", icon: Bot },
      { page: "audit", label: "سجل التغييرات", icon: ClipboardList },
    ],
  },
] as const;

const TITLES: Record<Route["page"], string> = {
  overview: "نظرة عامة",
  help: "طلبات المساعدة",
  people: "الأشخاص",
  person: "الأشخاص",
  khatmas: "الختمات",
  khatma: "الختمات",
  messages: "رسائل واتساب",
  settings: "الإعدادات",
  team: "الفريق والأدوار",
  agent: "المساعد وClaude",
  audit: "سجل التغييرات",
};

function activePage(route: Route): string {
  if (route.page === "person") return "people";
  if (route.page === "khatma") return "khatmas";
  return route.page;
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const preset = document.documentElement.dataset.theme;
    return preset ? preset === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  // A host page can set the theme from outside.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (root.dataset.theme) setDark(root.dataset.theme === "dark");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return { dark, toggle: () => setDark((d) => !d) };
}

function ProfileMenu({ compact }: { compact?: boolean }) {
  const role = useRole();
  const db = useDb();
  const admin = db.admins.find((a) => a.role === role) ?? db.admins[0];
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        {compact ? (
          <button type="button" aria-label="الحساب" className="rounded-full">
            <PersonAvatar name={admin.name} />
          </button>
        ) : (
          <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
            <PersonAvatar name={admin.name} className="size-7" />
            <span className="grid min-w-0 flex-1 text-start leading-tight">
              <span className="truncate text-[13px] font-medium">{admin.name}</span>
              <span className="truncate text-xs opacity-70">{ROLE_LABEL[role]}</span>
            </span>
          </SidebarMenuButton>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="start" side="top">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          جرّب الدور (معاينة)
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={role} onValueChange={(value) => {
          setRole(value as Role);
          toast(`تعرض اللوحة الآن كما يراها: ${ROLE_LABEL[value as Role]}`);
        }}>
          {(["owner", "support", "viewer"] as Role[]).map((r) => (
            <DropdownMenuRadioItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => {
          resetData();
          toast.success("أُعيدت البيانات التجريبية");
        }}>
          <RotateCcw /> إعادة البيانات التجريبية
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast("لا يوجد تسجيل خروج في النموذج")}>
          <LogOut /> تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar({ openHelp }: { openHelp: number }) {
  const route = useRoute();
  const { setOpenMobile } = useSidebar();
  const active = activePage(route);
  const allowed = useCanPage();
  const groups = NAV.map((group) => ({ ...group, items: group.items.filter((item) => allowed(item.page)) })).filter(
    (group) => group.items.length > 0,
  );
  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="h-14 justify-center">
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
          <span className="hidden font-display text-2xl leading-none text-white group-data-[collapsible=icon]:block">و</span>
          <span className="font-display text-xl leading-none text-white group-data-[collapsible=icon]:hidden">
            وِردك
          </span>
          <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-medium text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
            الإدارة
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/60">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={active === item.page}
                      tooltip={item.label}
                      onClick={() => {
                        go({ page: item.page } as Route);
                        setOpenMobile(false);
                      }}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.page === "help" && openHelp > 0 && (
                      <SidebarMenuBadge className="bg-sidebar-primary text-sidebar-primary-foreground">
                        {num(openHelp)}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ProfileMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar({ onSearch, theme }: { onSearch: () => void; theme: ReturnType<typeof useTheme> }) {
  const route = useRoute();
  const role = useRole();
  const agent = useAgent();
  return (
    <header className="page-gutter sticky top-[env(safe-area-inset-top,0px)] z-20 flex h-14 items-center gap-2 border-b bg-background/95 backdrop-blur">
      <SidebarTrigger className="hidden md:inline-flex" aria-label="طي القائمة" />
      <span className="font-display text-xl text-primary md:hidden">وِردك</span>
      <span className="hidden text-[13px] text-muted-foreground md:block">{TITLES[route.page]}</span>

      <div className="ms-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSearch}
          aria-label="بحث"
          className="flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-[13px] text-muted-foreground hover:bg-accent md:w-72"
        >
          <Search className="size-4" />
          <span className="hidden md:block">ابحث عن شخص أو رقم أو ختمة</span>
          <kbd className="ms-auto hidden rounded border bg-muted px-1.5 font-sans text-[11px] md:block" dir="ltr">
            ⌘K
          </kbd>
        </button>
        <Button
          variant={agent.open ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          aria-label="المساعد"
          onClick={() => (agent.open ? closeAgent() : openAgent())}
        >
          <Sparkles /> <span className="hidden sm:inline">المساعد</span>
        </Button>
        <span className="hidden rounded-md bg-saffron-soft px-2 py-1 text-xs font-medium text-saffron-ink lg:block">
          بيانات تجريبية
        </span>
        <Button variant="ghost" size="icon" aria-label="تبديل المظهر" onClick={theme.toggle}>
          {theme.dark ? <Sun /> : <Moon />}
        </Button>
        <span className="md:hidden">
          <ProfileMenu compact />
        </span>
        {role !== "owner" && (
          <span className="hidden rounded-md bg-info-soft px-2 py-1 text-xs font-medium text-info md:block">
            معاينة: {ROLE_LABEL[role]}
          </span>
        )}
      </div>
    </header>
  );
}

function BottomBar({ openHelp }: { openHelp: number }) {
  const route = useRoute();
  const { setOpenMobile } = useSidebar();
  const active = activePage(route);
  const allowed = useCanPage();
  const tabs = (
    [
      { page: "overview", label: "الرئيسية", icon: Home },
      { page: "help", label: "المساعدة", icon: LifeBuoy },
      { page: "people", label: "الأشخاص", icon: Users },
      { page: "khatmas", label: "الختمات", icon: BookOpen },
    ] as const
  ).filter((tab) => allowed(tab.page));
  const inMore = !tabs.some((tab) => tab.page === active);
  // A role whose pages all fit in the bar has nothing behind "more".
  const hasMore = NAV.some((group) => group.items.some((item) => allowed(item.page) && !tabs.some((tab) => tab.page === item.page)));
  return (
    <nav
      aria-label="التنقل"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + (hasMore ? 1 : 0)}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => (
          <li key={tab.page}>
            <button
              type="button"
              onClick={() => go({ page: tab.page } as Route)}
              className={cn(
                "relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]",
                active === tab.page ? "font-medium text-primary" : "text-muted-foreground",
              )}
            >
              <tab.icon className="size-5" />
              {tab.label}
              {tab.page === "help" && openHelp > 0 && (
                <span className="absolute end-3 top-1.5 rounded-full bg-saffron px-1 text-[10px] leading-4 text-white">
                  {num(openHelp)}
                </span>
              )}
            </button>
          </li>
        ))}
        {hasMore && <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className={cn(
              "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]",
              inMore ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            <Menu className="size-5" />
            المزيد
          </button>
        </li>}
      </ul>
    </nav>
  );
}

function NoAccess() {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center">
      <p className="font-medium">هذه الصفحة ليست ضمن صلاحيات دورك.</p>
      <Button variant="outline" size="sm" onClick={() => go({ page: "overview" })}>
        نظرة عامة
      </Button>
    </div>
  );
}

function Page() {
  const route = useRoute();
  useRole();
  if (!canPage(route.page)) return <NoAccess />;
  switch (route.page) {
    case "overview":
      return <OverviewPage />;
    case "people":
      return <PeoplePage />;
    case "person":
      return <PersonPage id={route.id} />;
    case "khatmas":
      return <KhatmasPage />;
    case "khatma":
      return <KhatmaPage id={route.id} />;
    case "help":
      return <HelpPage id={route.id} />;
    case "messages":
      return <MessagesPage />;
    case "settings":
      return <SettingsPage focusKey={route.key} />;
    case "team":
      return <TeamPage />;
    case "agent":
      return <AgentPage />;
    case "audit":
      return <AuditPage key={route.id} id={route.id} />;
  }
}

export function App() {
  const db = useDb();
  const theme = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openHelp = useMemo(() => db.help.filter((h) => h.status === "open").length, [db.help]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Direction.Provider dir="rtl">
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <AppSidebar openHelp={openHelp} />
          <SidebarInset className="min-w-0 bg-background">
            <TopBar onSearch={() => setPaletteOpen(true)} theme={theme} />
            <div className="flex min-w-0 flex-1">
              <main className="page-gutter mx-auto w-full min-w-0 max-w-[1400px] pt-4 pb-24 md:pt-5 md:pb-10">
                <Page />
              </main>
              <AgentPanel />
            </div>
          </SidebarInset>
          <BottomBar openHelp={openHelp} />
        </SidebarProvider>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <ConfirmHost />
        <Toaster
          dir="rtl"
          position="bottom-left"
          theme={theme.dark ? "dark" : "light"}
          toastOptions={{ style: { fontFamily: "var(--font-sans)" } }}
          offset={{ bottom: 16 }}
          mobileOffset={{ bottom: 80 }}
        />
      </TooltipProvider>
    </Direction.Provider>
  );
}
