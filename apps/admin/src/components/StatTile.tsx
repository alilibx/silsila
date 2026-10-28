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
      className={`rounded-ui border-2 px-3 py-2.5 ${tone === "warn" ? "border-saffron bg-saffron-soft" : "border-line bg-card"}`}
    >
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      {detail && <p className="text-xs text-ink-soft">{detail}</p>}
    </div>
  );
}
