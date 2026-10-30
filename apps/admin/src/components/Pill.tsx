import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PillTone = "neutral" | "good" | "warn" | "bad" | "info";

const TONES: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-good-soft text-good",
  warn: "bg-saffron-soft text-saffron-ink",
  bad: "bg-bad-soft text-destructive",
  info: "bg-info-soft text-info",
};

/** A short state label. Color never carries the meaning alone: the words do. */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
