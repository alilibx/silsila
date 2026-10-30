import { t } from "../../i18n/ar";

/** "1 of 2" in Arabic with a two-part progress bar, for the two setup screens. */
export function StepBar({ step, of = 2 }: { step: number; of?: number }) {
  return (
    <div className="mt-2.5">
      <p className="text-base font-medium text-ink-soft">
        {t.rota.step(step, of)}
      </p>
      <div aria-hidden="true" className="mt-1.5 flex gap-1.5">
        {Array.from({ length: of }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-green" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
