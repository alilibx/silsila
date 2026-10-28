import { useState, type ReactNode } from "react";
import { t } from "../../i18n/ar";
import { pendingIntent } from "./progress";
import { VerifySheet } from "./VerifySheet";

/**
 * Sign-in for someone who already has khatmas, on a new phone. Render `sheet` outside any
 * loading branch: signing in changes the session token, the page reloads its data, and the
 * sheet must survive that to show its last step. A sign-in still in flight (the tab reloaded
 * while the person was in WhatsApp) reopens the sheet.
 */
export function useSignInSheet(): { open: () => void; sheet: ReactNode } {
  const [isOpen, setOpen] = useState(() => pendingIntent()?.kind === "signin");
  const close = () => setOpen(false);
  return {
    open: () => setOpen(true),
    sheet: isOpen ? (
      <VerifySheet
        title={t.signIn.title}
        intent={{ kind: "signin" }}
        onVerified={close}
        onClose={close}
      />
    ) : null,
  };
}
