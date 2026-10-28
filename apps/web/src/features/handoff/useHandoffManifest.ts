import { useEffect } from "react";
import {
  createHandoffToken,
  extendHandoffToken,
  linkHandoffManifest,
} from "../../lib/handoff";
import { isIos, isStandalone } from "../../lib/push";
import { getSessionToken, useSessionToken } from "../../lib/session";

/** A token is extended once this share of its lifetime (the live `handoffTtlMs`) has passed. */
const RENEW_AT = 2 / 3;
const CHECK_MS = 60_000;

/**
 * The hand-off manifest this page linked. WebKit keeps the first manifest a page links, so there is
 * at most one, and its token is extended rather than replaced. `dead` once the server refuses it.
 */
let linked: {
  link: HTMLLinkElement;
  token: string;
  sessionToken: string;
  dead: boolean;
} | null = null;
/** The check in progress, shared by every caller until it settles. */
let inFlight: Promise<number | null> | null = null;

/**
 * Links the hand-off manifest the first time, then extends its token. The token's lifetime, or
 * null when there is nothing to do until the next check.
 */
async function keepAlive(sessionToken: string): Promise<number | null> {
  if (linked?.link.isConnected) {
    // A token from an earlier session on this page died with it; a new one would never be read.
    if (linked.dead || linked.sessionToken !== sessionToken) return null;
    const ttlMs = await extendHandoffToken(sessionToken, linked.token);
    if (ttlMs === "invalid") {
      linked.dead = true;
      return null;
    }
    return ttlMs;
  }
  // Another manifest came first, so iOS would never read a hand-off one.
  if (document.querySelector('link[rel="manifest"]')) return null;
  const created = await createHandoffToken(sessionToken);
  // Signed out while it was made: the token died with the session.
  if (!created || getSessionToken() !== sessionToken) return null;
  const link = await linkHandoffManifest(created.token);
  if (!link) return null;
  linked = { link, token: created.token, sessionToken, dead: false };
  return created.ttlMs;
}

/**
 * While signed in in an iPhone or iPad browser tab (any iOS browser can add to the home screen),
 * gives the page a manifest whose `start_url` carries a hand-off token, so the home-screen app
 * opens signed in however it was added: from Wirdak's install steps or straight from the Share
 * menu. The home-screen app itself redeems tokens instead (`HandoffGate`). iOS keeps the first
 * manifest a page links, so the token is linked once and extended before it expires; timers sleep
 * in a background tab, so an extension is also checked whenever the page becomes visible again.
 */
export function useHandoffManifest(): void {
  const sessionToken = useSessionToken();

  useEffect(() => {
    if (!sessionToken || !isIos() || isStandalone()) return;
    let cancelled = false;
    // When the token in place is due for extension; 0 until there is one.
    let renewAt = 0;

    const renew = async () => {
      inFlight ??= keepAlive(sessionToken).finally(() => {
        inFlight = null;
      });
      const ttlMs = await inFlight;
      if (ttlMs !== null && !cancelled) {
        renewAt = Date.now() + Math.max(CHECK_MS, ttlMs * RENEW_AT);
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
    };
  }, [sessionToken]);
}
