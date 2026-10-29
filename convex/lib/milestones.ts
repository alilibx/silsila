export type MilestoneMetric = "khatmas" | "members" | "completed";

/** The fixed steps of each metric, then a regular step forever after (spec 7). */
const SEQUENCES: Record<MilestoneMetric, { fixed: number[]; every: number }> = {
  khatmas: { fixed: [10, 50, 100, 250, 500, 1000], every: 1000 },
  members: { fixed: [100, 500, 1000, 5000, 10_000], every: 10_000 },
  completed: { fixed: [1, 10, 100, 1000], every: 1000 },
};

/** Every milestone of `metric` at or below `total`, smallest first. */
export function milestonesFor(
  metric: MilestoneMetric,
  total: number,
): number[] {
  const { fixed, every } = SEQUENCES[metric];
  const reached = fixed.filter((m) => m <= total);
  const last = fixed[fixed.length - 1]!;
  for (let m = last + every; m <= total; m += every) reached.push(m);
  return reached;
}
