import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { t } from "../i18n/ar";
import { useSessionToken } from "../lib/session";
import { Button } from "./Button";

/**
 * "Send them to me on WhatsApp": turns WhatsApp notifications on, then calls
 * `onDone`. Renders nothing while signed out or loading, or once they're on.
 */
export function WhatsAppOffer({
  onDone,
  variant = "ghost",
}: {
  onDone: () => void;
  variant?: "primary" | "ghost";
}) {
  const sessionToken = useSessionToken();
  const me = useQuery(api.sessions.me, { sessionToken });
  const setWhatsappNotes = useMutation(api.people.setWhatsappNotes);
  const [busy, setBusy] = useState(false);
  if (!sessionToken || !me || me.whatsappNotes) return null;

  async function turnOn() {
    if (busy || !sessionToken) return;
    setBusy(true);
    try {
      await setWhatsappNotes({ sessionToken, on: true });
    } catch {
      // Settings has the same switch; nothing more to tell the person here.
    } finally {
      onDone();
    }
  }

  return (
    <Button variant={variant} onClick={() => void turnOn()} disabled={busy}>
      {t.whatsappNotes.offer}
    </Button>
  );
}
