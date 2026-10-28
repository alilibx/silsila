import { useRef, type KeyboardEvent } from "react";
import { t } from "../i18n/ar";

export type KhatmaTab = "mine" | "pool" | "group";

const TABS: readonly KhatmaTab[] = ["mine", "pool", "group"];

/** The `?tab=` value: `pool` and `group`; anything else is the person's own juz'. */
export function parseTab(value: string | null): KhatmaTab {
  return value === "pool" || value === "group" ? value : "mine";
}

/** The `?tab=` value to write, or `null` to drop the parameter for the default tab. */
export function tabParam(tab: KhatmaTab): string | null {
  return tab === "mine" ? null : tab;
}

type Props = {
  tab: KhatmaTab;
  onChange: (tab: KhatmaTab) => void;
  /** Tab ids are `${idPrefix}-tab-<tab>`; the page renders the panel `${idPrefix}-panel`. */
  idPrefix: string;
};

/** The khatma's three sections as labelled tabs (navigation spec 4.2). No swipe. */
export function KhatmaTabs({ tab, onChange, idPrefix }: Props) {
  const refs = useRef<Partial<Record<KhatmaTab, HTMLButtonElement | null>>>({});

  const select = (next: KhatmaTab) => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    // In Arabic (dir="rtl") the next tab sits on the ArrowLeft side.
    const forward =
      document.documentElement.dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const back = forward === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
    const target =
      event.key === forward
        ? TABS[(at + 1) % TABS.length]
        : event.key === back
          ? TABS[(at + TABS.length - 1) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
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
      {TABS.map((name) => {
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
            {t.nav.tabs[name]}
          </button>
        );
      })}
    </div>
  );
}
