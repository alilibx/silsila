import type { KhatmaView } from "@convex/khatmas";
import { JUZ } from "@convex/lib/juz";
import { toArabicDigits } from "@convex/lib/digits";
import { t } from "../i18n/ar";
import { Button } from "./Button";

type Props = {
  view: KhatmaView;
  onTake: (juz: number) => void;
  onFinish: () => void;
  onRelease: () => void;
};

const card =
  "rounded-3xl border border-line bg-card p-4.5 shadow-[0_2px_0_rgba(0,0,0,0.03)]";

export function MainCard({ view, onTake, onFinish, onRelease }: Props) {
  const { holding, suggestion } = view.me;

  if (holding !== null) {
    const juz = JUZ.find((j) => j.number === holding);
    return (
      <div
        className={`${card} border-2 border-saffron bg-linear-to-br from-[#FFF6E0] to-saffron-soft`}
      >
        <div className="text-base font-semibold text-saffron-ink">
          {t.card.held}
        </div>
        <div className="mt-1.5 mb-0.5 flex items-baseline gap-3">
          <span className="text-[3.4rem] leading-none font-bold text-saffron-ink">
            {toArabicDigits(holding)}
          </span>
          {juz && (
            <span className="font-display text-[2rem] text-ink">
              {juz.name}
            </span>
          )}
        </div>
        {juz && (
          <div className="mb-4 text-base text-ink-soft">
            {t.card.startsFrom(juz.startSurah)}
          </div>
        )}
        <div className="grid gap-3">
          <Button onClick={onFinish}>{t.card.finish}</Button>
          <Button variant="ghost" onClick={onRelease}>
            {t.card.release}
          </Button>
        </div>
      </div>
    );
  }

  if (suggestion !== null) {
    const juz = JUZ.find((j) => j.number === suggestion);
    return (
      <div className={card}>
        <Button onClick={() => onTake(suggestion)}>{t.card.take}</Button>
        {juz && (
          <p className="mt-3 text-center text-ink-soft">
            {t.card.suggest(toArabicDigits(suggestion), juz.name)}
          </p>
        )}
        <div className="text-center">
          <a
            href="#pool"
            className="inline-flex min-h-14 items-center px-2.5 font-semibold text-green underline underline-offset-4"
          >
            {t.card.pickYourself}
          </a>
        </div>
      </div>
    );
  }

  if (view.tiles.some((x) => x.state === "open")) return null;

  return (
    <div className={`${card} text-center`}>
      <p className="text-xl font-semibold">{t.card.allTaken}</p>
      <p className="mt-1.5 text-base text-ink-soft">{t.card.allTakenHint}</p>
    </div>
  );
}
