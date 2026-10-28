import { useState } from "react";
import { t } from "../../i18n/ar";
import { captureScreen } from "./captureScreen";
import { useHelpUi } from "./helpUi";

/**
 * The help button on every screen (spec 3.1). It captures the screen as it is, before
 * the sheet covers it, then opens the help sheet with that picture.
 */
export function HelpButton() {
  const { openSheet, buttonHidden } = useHelpUi();
  const [busy, setBusy] = useState(false);
  if (buttonHidden) return null;
  return (
    <button
      type="button"
      aria-label={t.help.open}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const screenshot = await captureScreen();
        setBusy(false);
        openSheet({ screenshot });
      }}
      className="fixed left-3 z-40 flex size-11 items-center justify-center rounded-full border-2 border-green bg-card text-lg font-semibold text-green shadow-sm disabled:opacity-60"
      style={{ top: "max(12px, env(safe-area-inset-top))" }}
    >
      {t.help.mark}
    </button>
  );
}
