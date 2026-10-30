import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  addDays,
  khatmaNumber,
  nextReadingDates,
  ROTA_SIZE,
  slotFor,
} from "./rota";
import { localDate } from "./wakingTime";

/** The next reading day that has not started: where new people and changes to the ajza' land. */
export type TargetDay = {
  /** The day's count across the whole khatma, from 1. */
  n: number;
  /** Its khatma number within the cycle, 1 to 30. */
  number: number;
  /** Its reading date, or null while the khatma is paused or has no more days. */
  date: string | null;
  started: false;
};

export type RotaConfig = NonNullable<Doc<"khatmas">["rota"]>;

/** The rota settings of a khatma that has them (a pool khatma never reaches here). */
function rotaOf(khatma: Doc<"khatmas">) {
  if (khatma.kind !== "rota" || !khatma.rota) {
    throw new Error("not a rota khatma");
  }
  return khatma.rota;
}

/** The latest started reading day of the khatma, or null before the first. */
export function lastRotaDay(
  ctx: QueryCtx,
  khatmaId: Id<"khatmas">,
): Promise<Doc<"rotaDays"> | null> {
  return ctx.db
    .query("rotaDays")
    .withIndex("by_khatma_n", (q) => q.eq("khatmaId", khatmaId))
    .order("desc")
    .first();
}

/**
 * The first date a day may still start on: today or the first date, whichever
 * is later, and always after the last started day. Days only go forward, which
 * a time zone moved west could otherwise break.
 */
export function earliestOpenDate(
  rota: RotaConfig,
  last: Doc<"rotaDays"> | null,
  today: string,
): string {
  const from = today > rota.firstDate ? today : rota.firstDate;
  return last && from <= last.date ? addDays(last.date, 1) : from;
}

export async function targetDay(
  ctx: QueryCtx,
  khatma: Doc<"khatmas">,
): Promise<TargetDay> {
  const rota = rotaOf(khatma);
  const last = await lastRotaDay(ctx, khatma._id);
  const n = (last?.n ?? 0) + 1;
  if (rota.pausedAt !== null) {
    return { n, number: khatmaNumber(n), date: null, started: false };
  }
  const from = earliestOpenDate(
    rota,
    last,
    localDate(Date.now(), rota.timeZone),
  );
  // `from` is after the last started day, so no started day has the first
  // reading date that remains (pause dates left out).
  const [date] = nextReadingDates(
    rota.days,
    rota.firstDate,
    from,
    1,
    new Set(rota.pauseDates),
  );
  if (date === undefined || (rota.endDate !== null && date > rota.endDate)) {
    return { n, number: khatmaNumber(n), date: null, started: false };
  }
  return { n, number: khatmaNumber(n), date, started: false };
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
