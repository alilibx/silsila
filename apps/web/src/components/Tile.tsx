import type { TileView } from "@convex/khatmas";
import { toArabicDigits } from "@convex/lib/text";
import { t } from "../i18n/ar";

type Props = { tile: TileView; onTake: (juz: number) => void };

const base =
  "relative flex min-h-24 w-full flex-col items-center justify-between rounded-2xl border-2 px-2 pt-2.5 pb-2 text-center font-sans disabled:cursor-default";

const chip =
  "max-w-full truncate rounded-full px-2 py-0.5 text-sm font-semibold";

/** One juz'. Only open tiles can be pressed. The state is always a word; reader names show on "reading" tiles only. */
export function Tile({ tile, onTake }: Props) {
  const { juz, name, state, readerName, isMine } = tile;
  const number = toArabicDigits(juz);
  // A done tile never shows a name, whatever the data says.
  const reader = state === "reading" && !isMine ? readerName : null;

  const stateWord =
    state === "done"
      ? t.tile.doneWord
      : state === "reading"
        ? t.tile.reading
        : t.tile.open;
  const label = [t.tile.juz(number), name, stateWord, reader]
    .filter(Boolean)
    .join(t.common.listSeparator);

  const look =
    state === "open"
      ? "border-dashed border-[#8A7D62] bg-card text-ink hover:border-green focus-visible:border-green"
      : state === "reading"
        ? "border-saffron bg-saffron-soft text-ink"
        : "border-green bg-green text-[#F4EEDD]";
  const chipLook =
    state === "open"
      ? "bg-paper-2 text-ink-soft"
      : state === "reading"
        ? "bg-[#fff8e6] text-saffron-ink"
        : "bg-white/15 text-[#F4EEDD]";
  const mine = isMine
    ? "shadow-[0_0_0_3px_var(--card),0_0_0_5px_var(--saffron)]"
    : "";

  return (
    <button
      type="button"
      disabled={state !== "open"}
      aria-label={label}
      onClick={() => onTake(juz)}
      className={`${base} ${look} ${mine}`}
    >
      <span className="text-[1.45rem] leading-none font-bold">{number}</span>
      <span className="text-base font-medium">{name}</span>
      <span className={`${chip} ${chipLook}`}>
        {state === "done"
          ? t.tile.done
          : state === "reading"
            ? isMine
              ? t.tile.mine
              : t.tile.reading
            : t.tile.open}
      </span>
      {reader && (
        <span className="max-w-full truncate text-sm text-saffron-ink">
          {reader}
        </span>
      )}
    </button>
  );
}
