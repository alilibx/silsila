import { dayStart } from "@convex/lib/stats";
import { formatDate } from "@web/lib/format";
import { useState } from "react";
import { t } from "../i18n/ar";

type Point = { day: number; value: number | null };

type Props = {
  points: Point[];
  format: (value: number) => string;
  label: string;
  /** The period in words, for the screen-reader summary. */
  period: string;
};

const HEIGHT = 120;
const SLOT = 12;
/** Bars stay thin and leave air in their slot (dataviz: <= 24px, never fill the slot). */
const BAR = 8;
const RADIUS = 2;

/** A column rounded at its data end and square at the baseline. */
function columnPath(x: number, top: number, width: number): string {
  const r = Math.min(RADIUS, width / 2, HEIGHT - top);
  return [
    `M${x},${HEIGHT}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${HEIGHT}`,
    "Z",
  ].join(" ");
}

/**
 * One series over time as thin columns (spec 6.1). A day with no row is an
 * empty slot, not a zero. Hover or tap a day for its value.
 */
export function TrendChart({ points, format, label, period }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  if (values.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">{t.stats.noData}</p>;
  }
  const max = Math.max(...values, 0) || 1;
  const width = points.length * SLOT;
  const latest = [...points].reverse().find((p) => p.value !== null);
  const shown = active !== null ? points[active] : latest;
  const describe = (p: Point | undefined) =>
    p && p.value !== null
      ? t.stats.tooltip(formatDate(dayStart(p.day)), format(p.value))
      : "";

  return (
    <figure className="flex flex-col gap-2">
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {describe(shown)}
      </p>
      <svg
        role="img"
        aria-label={t.stats.chartSummary(
          label,
          latest?.value != null ? format(latest.value) : t.stats.none,
          period,
        )}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        // Time runs left to right even in an RTL page.
        style={{ direction: "ltr" }}
        onPointerLeave={() => setActive(null)}
      >
        <line
          x1={0}
          y1={HEIGHT - 0.5}
          x2={width}
          y2={HEIGHT - 0.5}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const x = i * SLOT + (SLOT - BAR) / 2;
          return (
            <g key={p.day}>
              {p.value === null ? (
                <line
                  data-gap
                  x1={x}
                  x2={x + BAR}
                  y1={HEIGHT - 2}
                  y2={HEIGHT - 2}
                  stroke="var(--border)"
                  strokeDasharray="2 2"
                />
              ) : (
                <path
                  data-bar
                  d={columnPath(
                    x,
                    HEIGHT - Math.max(1, (p.value / max) * (HEIGHT - 4)),
                    BAR,
                  )}
                  fill={i === active ? "var(--sidebar-primary)" : "var(--chart-1)"}
                />
              )}
              <rect
                data-hit
                x={i * SLOT}
                y={0}
                width={SLOT}
                height={HEIGHT}
                fill="transparent"
                onPointerEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
