import { toArabicDigits } from "@convex/lib/digits";
import { JUZ } from "@convex/lib/juz";
import { t } from "../i18n/ar";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

type Props = {
  juz: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Confirms taking one juz': its number, name and first surah. */
export function TakeSheet({ juz, busy, onConfirm, onClose }: Props) {
  const info = JUZ.find((j) => j.number === juz);
  const number = toArabicDigits(juz);
  return (
    <Sheet title={t.tile.juz(number)} onClose={onClose}>
      <div className="py-2.5 text-center">
        <div className="text-[4.2rem] leading-none font-bold text-green-deep">
          {number}
        </div>
        {info && (
          <>
            <div className="mt-1 font-display text-[2.4rem]">{info.name}</div>
            <div className="mt-1 text-base text-ink-soft">
              {t.card.startsFrom(info.startSurah)}
            </div>
          </>
        )}
      </div>
      <div className="mt-5 grid gap-3">
        <Button onClick={onConfirm} disabled={busy}>
          {t.take.confirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.take.notNow}
        </Button>
      </div>
    </Sheet>
  );
}
