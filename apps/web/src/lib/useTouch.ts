import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { syncPush } from "./push";
import { readStored, useSessionToken, writeStored } from "./session";

const TOUCHED_KEY = "wirdak.touchedAt";
const TOUCH_EVERY_MS = 3_600_000;

/** Stored as "<time>:<end of the token>", so a different person signing in is touched at once. */
function recentlyTouched(sessionToken: string): boolean {
  const [time, tag] = (readStored(TOUCHED_KEY) ?? "").split(":");
  return (
    tag === sessionToken.slice(-8) && Date.now() - Number(time) < TOUCH_EVERY_MS
  );
}

/**
 * Mounted once in `App`. While signed in it keeps the server's picture of this person fresh:
 * `people.touch` (last seen and time zone) on load and whenever the page becomes visible, at most
 * once an hour, and the push subscription (on load and when the service worker reports that the
 * browser renewed it).
 */
export function useTouch(): void {
  const sessionToken = useSessionToken();
  const touch = useMutation(api.people.touch);

  useEffect(() => {
    if (!sessionToken) return;

    const run = () => {
      if (document.visibilityState === "hidden") return;
      if (recentlyTouched(sessionToken)) return;
      writeStored(TOUCHED_KEY, `${Date.now()}:${sessionToken.slice(-8)}`);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      touch({ sessionToken, timeZone }).catch(() => {
        // Allow a retry on the next visibility change.
        writeStored(TOUCHED_KEY, "");
      });
    };
    const sync = () => void syncPush(sessionToken);

    run();
    sync();
    document.addEventListener("visibilitychange", run);
    // sw.js can't re-subscribe by itself (it has no session), so it asks open pages to.
    const worker =
      "serviceWorker" in navigator ? navigator.serviceWorker : null;
    worker?.addEventListener("message", onMessage);
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "pushsubscriptionchange") sync();
    }
    return () => {
      document.removeEventListener("visibilitychange", run);
      worker?.removeEventListener("message", onMessage);
    };
  }, [sessionToken, touch]);
}
