import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { t } from "../i18n/ar";
import {
  trackPromptChoice,
  type NotificationPrompt,
} from "../lib/notificationPrompt";
import { useSessionToken } from "../lib/session";
import { Button } from "./Button";

/**
 * "Send them to me on WhatsApp": turns WhatsApp notifications on, then calls
 * `onDone`. Renders nothing while signed out or loading, or once they're on.
 * `prompt` names the sheet it sits in, for the choice event; without it nothing is recorded.
 */
export function WhatsAppOffer({
  onDone,
  prompt,
  variant = "ghost",
}: {
  onDone: () => void;
  prompt?: NotificationPrompt;
  variant?: "primary" | "ghost";
}) {
  const sessionToken = useSessionToken();
  const me = useQuery(api.sessions.me, { sessionToken });
  const setWhatsappNotes = useMutation(api.people.setWhatsappNotes);
  const [busy, setBusy] = useState(false);
  if (!sessionToken || !me || me.whatsappNotes) return null;

  async function turnOn() {
    if (busy || !sessionToken) return;
    if (prompt) trackPromptChoice(prompt, "whatsapp");
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
