import { useRef, type KeyboardEvent } from "react";
import { t } from "../i18n/ar";

export type KhatmaTab = "mine" | "pool" | "group";

type TabDef<T extends string> = { id: T; label: string };

const POOL_TABS: readonly TabDef<KhatmaTab>[] = [
  { id: "mine", label: t.nav.tabs.mine },
  { id: "pool", label: t.nav.tabs.pool },
  { id: "group", label: t.nav.tabs.group },
];

/** The `?tab=` value: `pool` and `group`; anything else is the person's own juz'. */
export function parseTab(value: string | null): KhatmaTab {
  return value === "pool" || value === "group" ? value : "mine";
}

/** The `?tab=` value to write, or `null` to drop the parameter for the default tab. */
export function tabParam(tab: KhatmaTab): string | null {
  return tab === "mine" ? null : tab;
}

type Props<T extends string> = {
  tab: T;
  onChange: (tab: T) => void;
  /** Tab ids are `${idPrefix}-tab-<tab>`; the page renders the panel `${idPrefix}-panel`. */
  idPrefix: string;
  /** The tabs and their labels. Left out, the pool khatma's three sections. */
  tabs?: readonly TabDef<T>[];
};

/** The khatma's sections as labelled tabs (navigation spec 4.2). No swipe. */
export function KhatmaTabs<T extends string = KhatmaTab>({
  tab,
  onChange,
  idPrefix,
  // The default list is the pool khatma's, which is what `T` is when no list is given.
  tabs = POOL_TABS as readonly TabDef<string>[] as readonly TabDef<T>[],
}: Props<T>) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const ids = tabs.map((entry) => entry.id);

  const select = (next: T) => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const at = ids.indexOf(tab);
    // In Arabic (dir="rtl") the next tab sits on the ArrowLeft side.
    const forward =
      document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = forward === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
    const target =
      event.key === forward
        ? ids[(at + 1) % ids.length]
        : event.key === back
          ? ids[(at + ids.length - 1) % ids.length]
          : event.key === "Home"
            ? ids[0]
            : event.key === "End"
              ? ids[ids.length - 1]
              : null;
    if (!target) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div
      role="tablist"
      aria-label={t.nav.tabs.label}
      onKeyDown={onKeyDown}
      className="mt-4 flex flex-wrap gap-1 rounded-ui bg-paper-2 p-1"
    >
      {tabs.map(({ id: name, label }) => {
        const selected = name === tab;
        return (
          <button
            key={name}
            ref={(el) => {
              refs.current[name] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${name}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(name)}
            className={`min-h-14 grow basis-auto rounded-[14px] px-2 text-center leading-tight ${
              selected
                ? "bg-card font-semibold text-green-deep shadow-sm"
                : "text-ink-soft"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
