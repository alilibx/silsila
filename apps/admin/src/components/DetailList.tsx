import type { ReactNode } from "react";

/** Label and value rows: two columns when there's room, stacked on a phone. */
export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-y-2.5 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="-mt-2 min-w-0 break-words sm:mt-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
