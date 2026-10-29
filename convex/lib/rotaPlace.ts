import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { khatmaNumber, nextReadingDates, ROTA_SIZE, slotFor } from "./rota";
import { localDate } from "./wakingTime";

/** The next reading day that has not started: where new people and changes to the ajza' land. */
export type TargetDay = {
  /** The day's count across the whole khatma, from 1. */
  n: number;
  /** Its khatma number within the cycle, 1 to 30. */
  number: number;
  /** Its reading date, or null while the khatma is paused. */
  date: string | null;
  started: false;
};

/** The rota settings of a khatma that has them (a pool khatma never reaches here). */
function rotaOf(khatma: Doc<"khatmas">) {
  if (khatma.kind !== "rota" || !khatma.rota) {
    throw new Error("not a rota khatma");
  }
  return khatma.rota;
}

export async function targetDay(
  ctx: QueryCtx,
  khatma: Doc<"khatmas">,
): Promise<TargetDay> {
  const rota = rotaOf(khatma);
  const last = await ctx.db
    .query("rotaDays")
    .withIndex("by_khatma_n", (q) => q.eq("khatmaId", khatma._id))
    .order("desc")
    .first();
  const n = (last?.n ?? 0) + 1;
  if (rota.pausedAt !== null) {
    return { n, number: khatmaNumber(n), date: null, started: false };
  }
  const today = localDate(Date.now(), rota.timeZone);
  const from = today > rota.firstDate ? today : rota.firstDate;
  // Only today can already have a row, so the first of two candidates is free.
  for (const date of nextReadingDates(
    rota.days,
    rota.firstDate,
    from,
    2,
    new Set(rota.pauseDates),
  )) {
    const started = await ctx.db
      .query("rotaDays")
      .withIndex("by_khatma_date", (q) =>
        q.eq("khatmaId", khatma._id).eq("date", date),
      )
      .first();
    if (!started) {
      return { n, number: khatmaNumber(n), date, started: false };
    }
  }
  return { n, number: khatmaNumber(n), date: null, started: false };
}

/** Who holds each juz' of khatma `number`: the slot row for that juz', if any. */
export async function slotRowsByJuz(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
  number: number,
): Promise<Map<number, Doc<"rotaSlots">>> {
  const slots = await ctx.db
    .query("rotaSlots")
    .withIndex("by_khatma_slot", (q) => q.eq("khatmaId", khatmaId))
    .collect();
  const bySlot = new Map(slots.map((s) => [s.slot, s]));
  const out = new Map<number, Doc<"rotaSlots">>();
  for (let juz = 1; juz <= ROTA_SIZE; juz++) {
    const row = bySlot.get(slotFor(juz, number));
    if (row) out.set(juz, row);
  }
  return out;
}
