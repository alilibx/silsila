import { useEffect } from "react";
import { createHandoffToken, installHandoffManifest } from "../../lib/handoff";
import { useSessionToken } from "../../lib/session";

/** Tokens live 30 minutes (`handoffTtlMs`); renew well before that. */
export const HANDOFF_RENEW_MS = 20 * 60_000;
const CHECK_MS = 60_000;

/**
 * Only iPhone Safari defines `navigator.standalone`, and it is `false` in a browser tab (`true`
 * in the home-screen app, which redeems the token instead).
 */
function inIphoneBrowserTab(): boolean {
  return (navigator as { standalone?: boolean }).standalone === false;
}

/**
 * While signed in on iPhone Safari, keeps the page's manifest swapped for one whose `start_url`
 * carries a fresh hand-off token. Safari's Share menu saves whatever manifest is in place, so the
 * home-screen app opens signed in however it was added: from Wirdak's install steps or straight
 * from the Share menu. A token is single-use and renewed before it expires; timers sleep in a
 * background tab, so a renewal is also checked whenever the page becomes visible again.
 */
export function useHandoffManifest(): void {
  const sessionToken = useSessionToken();

  useEffect(() => {
    if (!sessionToken || !inIphoneBrowserTab()) return;
    let cancelled = false;
    let restore = () => {};
    let issuedAt = 0;
    let renewing = false;

    const renew = async () => {
      if (renewing) return;
      renewing = true;
      try {
        const token = await createHandoffToken(sessionToken);
        if (!token || cancelled) return;
        // Back to the static manifest first, so the new one is built from it.
        restore();
        restore = () => {};
        const undo = await installHandoffManifest(token);
        if (cancelled) {
          undo();
          return;
        }
        restore = undo;
        issuedAt = Date.now();
      } finally {
        renewing = false;
      }
    };
    const renewIfDue = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - issuedAt >= HANDOFF_RENEW_MS) void renew();
      }
    };

    void renew();
    const timer = setInterval(renewIfDue, CHECK_MS);
    document.addEventListener("visibilitychange", renewIfDue);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", renewIfDue);
      restore();
    };
  }, [sessionToken]);
}
