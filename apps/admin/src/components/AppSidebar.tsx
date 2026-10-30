import { NavLink, useLocation } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { t } from "../i18n/ar";
import { HelpBadge } from "./HelpBadge";
import { NAV, navPath } from "./nav";

export function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const active = navPath(pathname);
  return (
    <Sidebar side="left" collapsible="icon">
      <SidebarHeader className="h-14 justify-center">
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center">
          <span className="hidden font-display text-2xl leading-none text-white group-data-[collapsible=icon]:block">
            {t.app.name.slice(0, 1)}
          </span>
          <span className="font-display text-xl leading-none text-white group-data-[collapsible=icon]:hidden">
            {t.app.name}
          </span>
          <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[11px] font-medium text-sidebar-primary-foreground group-data-[collapsible=icon]:hidden">
            {t.badge}
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/60">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active === item.to}
                      tooltip={item.label}
                    >
                      <NavLink
                        to={item.to}
                        end={item.to === "/"}
                        onClick={() => setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                        {item.to === "/help" && (
                          <HelpBadge className="ms-auto group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:-end-0.5 group-data-[collapsible=icon]:-top-0.5 group-data-[collapsible=icon]:px-1" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
