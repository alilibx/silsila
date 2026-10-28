import { useState } from "react";
import { t } from "../i18n/ar";
import { enablePush } from "../lib/push";
import { useSessionToken } from "../lib/session";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { WhatsAppOffer } from "./WhatsAppOffer";

/** One plain sentence about why, then the browser's own permission dialog. */
export function PushPromptSheet({ onClose }: { onClose: () => void }) {
  const sessionToken = useSessionToken();
  const [busy, setBusy] = useState(false);

  async function enable() {
    if (!sessionToken || busy) return onClose();
    setBusy(true);
    try {
      await enablePush(sessionToken);
    } catch {
      // The next load's sync retries; nothing more to tell the person.
    } finally {
      onClose();
    }
  }

  return (
    <Sheet title={t.push.title} onClose={onClose}>
      <p className="leading-relaxed text-ink-soft">{t.push.body}</p>
      <div className="mt-5 grid gap-3">
        <Button onClick={() => void enable()} disabled={busy}>
          {t.push.enable}
        </Button>
        <WhatsAppOffer onDone={onClose} />
        <Button variant="ghost" onClick={onClose}>
          {t.push.notNow}
        </Button>
      </div>
    </Sheet>
  );
}
