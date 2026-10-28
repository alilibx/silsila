import type { ReactNode } from "react";
import { t } from "../i18n/ar";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

const icon = {
  width: 40,
  height: 40,
  viewBox: "0 0 40 40",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** Safari's Share button: a box with an arrow leaving it. */
const ShareIcon = () => (
  <svg {...icon}>
    <path d="M20 5v18M13 12l7-7 7 7M10 19H8v14h24V19h-2" />
  </svg>
);

/** The "add to home screen" entry: a square with a plus. */
const AddIcon = () => (
  <svg {...icon}>
    <rect x="6" y="6" width="28" height="28" rx="6" />
    <path d="M20 13v14M13 20h14" />
  </svg>
);

/** The confirm button in the corner of the dialog. */
const ConfirmIcon = () => (
  <svg {...icon}>
    <circle cx="20" cy="20" r="14" />
    <path d="M13 20.5l5 5 9-11" />
  </svg>
);

function Step({
  n,
  glyph,
  children,
}: {
  n: number;
  glyph: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 rounded-ui border border-line bg-paper-2 p-4">
      <span className="text-green">{glyph}</span>
      <span className="font-medium leading-relaxed">
        <span className="me-2 text-ink-soft">{n}.</span>
        {children}
      </span>
    </li>
  );
}

/**
 * The iPhone steps for putting Wirdak on the home screen. The sign-in hand-off doesn't depend on
 * this sheet: `useHandoffManifest` keeps the token-carrying manifest in place the whole time a
 * signed-in iPhone Safari tab is open, so adding straight from the Share menu works too.
 */
export function InstallStepsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={t.install.title} onClose={onClose}>
      <p className="leading-relaxed text-ink-soft">{t.install.intro}</p>
      <ol className="mt-4 grid gap-3">
        <Step n={1} glyph={<ShareIcon />}>
          {t.install.steps.share}
        </Step>
        <Step n={2} glyph={<AddIcon />}>
          {t.install.steps.add}
        </Step>
        <Step n={3} glyph={<ConfirmIcon />}>
          {t.install.steps.confirm}
        </Step>
      </ol>
      <div className="mt-5 grid gap-3">
        <Button onClick={onClose}>{t.install.added}</Button>
        <Button variant="ghost" onClick={onClose}>
          {t.install.notNow}
        </Button>
      </div>
    </Sheet>
  );
}
