import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/** A side panel on a desktop and a bottom sheet on a phone. A tap outside doesn't close it. */
export function AdminSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={mobile ? "bottom" : "right"}
        aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        className={cn(
          "overflow-y-auto",
          mobile ? "max-h-[85svh]" : "w-full sm:max-w-md",
        )}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4 text-[13px]">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
