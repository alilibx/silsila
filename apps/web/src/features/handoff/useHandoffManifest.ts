import { useEffect } from "react";
import { createHandoffToken, installHandoffManifest } from "../../lib/handoff";
import { isIos, isStandalone } from "../../lib/push";
import { useSessionToken } from "../../lib/session";

/** A token is renewed once this share of its lifetime (the live `handoffTtlMs`) has passed. */
const RENEW_AT = 2 / 3;
const CHECK_MS = 60_000;

/**
 * While signed in in an iPhone or iPad browser tab (any iOS browser can add to the home screen),
 * keeps the page's manifest swapped for one whose `start_url` carries a fresh hand-off token. The
 * Share menu saves whatever manifest is in place, so the home-screen app opens signed in however
 * it was added: from Wirdak's install steps or straight from the Share menu. The home-screen app
 * itself redeems tokens instead (`HandoffGate`). A token is single-use and renewed before it expires; timers sleep in a
 * background tab, so a renewal is also checked whenever the page becomes visible again.
 */
export function useHandoffManifest(): void {
  const sessionToken = useSessionToken();

  useEffect(() => {
    if (!sessionToken || !isIos() || isStandalone()) return;
    let cancelled = false;
    let restore = () => {};
    // When the token in place is due for renewal; 0 until there is one.
    let renewAt = 0;
    let renewing = false;

    const renew = async () => {
      if (renewing) return;
      renewing = true;
      try {
        const created = await createHandoffToken(sessionToken);
        if (!created || cancelled) return;
        // Back to the static manifest first, so the new one is built from it.
        restore();
        restore = () => {};
        const undo = await installHandoffManifest(created.token);
        if (cancelled) {
          undo();
          return;
        }
        restore = undo;
        renewAt = Date.now() + Math.max(CHECK_MS, created.ttlMs * RENEW_AT);
      } finally {
        renewing = false;
      }
    };
    const renewIfDue = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() >= renewAt) void renew();
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
