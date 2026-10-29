import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { t } from "../i18n/ar";
import { useSessionToken } from "../lib/session";
import { Button } from "./Button";
import { Sheet } from "./Sheet";
import { WhatsAppOffer } from "./WhatsAppOffer";

/** After a first juz' in a browser without push: WhatsApp is the only way to be told. */
export function WhatsAppSheet({ onClose }: { onClose: () => void }) {
  const me = useQuery(api.sessions.me, { sessionToken: useSessionToken() });
  // Nothing to offer to someone who already has it on.
  if (!me || me.whatsappNotes) return null;
  return (
    <Sheet title={t.whatsappNotes.sheetTitle} onClose={onClose}>
      <p className="leading-relaxed text-ink-soft">
        {t.whatsappNotes.sheetBody}
      </p>
      <div className="mt-5 grid gap-3">
        <WhatsAppOffer variant="primary" onDone={onClose} />
        <Button variant="ghost" onClick={onClose}>
          {t.whatsappNotes.notNow}
        </Button>
      </div>
    </Sheet>
  );
}
