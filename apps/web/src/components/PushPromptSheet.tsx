import { useState } from "react";
import { t } from "../i18n/ar";
import {
  trackPromptChoice,
  type NotificationChoice,
} from "../lib/notificationPrompt";
import { enablePush } from "../lib/push";
import { useSessionToken } from "../lib/session";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { WhatsAppOffer } from "./WhatsAppOffer";

/** One plain sentence about why, then the browser's own permission dialog. */
export function PushPromptSheet({ onClose }: { onClose: () => void }) {
  const sessionToken = useSessionToken();
  const [busy, setBusy] = useState(false);

  function choose(choice: NotificationChoice) {
    // Closing while enable runs: enable records the choice when it settles.
    if (!busy) trackPromptChoice("push", choice);
    onClose();
  }

  async function enable() {
    if (!sessionToken || busy) return onClose();
    setBusy(true);
    let result = "error";
    try {
      result = await enablePush(sessionToken);
    } catch {
      // The next load's sync retries; nothing more to tell the person.
    } finally {
      trackPromptChoice("push", "enable", result);
      onClose();
    }
  }

  return (
    <Sheet title={t.push.title} onClose={() => choose("dismissed")}>
      <p className="leading-relaxed text-ink-soft">{t.push.body}</p>
      <div className="mt-5 grid gap-3">
        <Button onClick={() => void enable()} disabled={busy}>
          {t.push.enable}
        </Button>
        <WhatsAppOffer prompt="push" onDone={onClose} />
        <Button variant="ghost" onClick={() => choose("not_now")}>
          {t.push.notNow}
        </Button>
      </div>
    </Sheet>
  );
}
