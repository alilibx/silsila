import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "./AppSidebar";
import { BottomBar } from "./BottomBar";
import { TopBar } from "./TopBar";

/** The signed-in frame: sidebar on a desktop, a bottom bar on a phone. */
export function Layout({ actions }: { actions?: ReactNode }) {
  const mobile = useIsMobile();
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <TopBar actions={actions} />
          <main className="mx-auto w-full max-w-[1400px] min-w-0 px-4 pt-4 pb-24 md:px-5 md:pt-5 md:pb-10">
            <Outlet />
          </main>
        </SidebarInset>
        {mobile && <BottomBar />}
      </SidebarProvider>
    </TooltipProvider>
  );
}
