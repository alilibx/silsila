import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  detail?: string;
  tone?: "normal" | "warn";
  testId?: string;
};

/** One number on the dashboard, with its label and a line of context. */
export function StatTile({
  label,
  value,
  detail,
  tone = "normal",
  testId,
}: Props) {
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        "rounded-lg border p-3.5",
        tone === "warn" ? "border-saffron bg-saffron-soft" : "bg-card",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-2xl font-semibold">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
