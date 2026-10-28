import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { PushPromptSheet } from "../../components/PushPromptSheet";
import { t } from "../../i18n/ar";
import { redeemHandoffToken } from "../../lib/handoff";
import { isStandalone, markPushAsked, pushSupport } from "../../lib/push";
import { getSessionToken, setSessionToken } from "../../lib/session";

/**
 * First launch of the iPhone home-screen app: a `?h=` token from the swapped-in manifest's
 * `start_url` is traded for a session of this app's own, then the push prompt follows. It only
 * redeems inside the home-screen app, and never over a session the app already has.
 */
export function HandoffGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Read once on mount (a ref survives StrictMode's second effect run, so one token, one redeem).
  const started = useRef(false);
  // Decided before the first render, so nothing flashes signed out while the token is traded.
  const [redeeming, setRedeeming] = useState(
    () =>
      new URLSearchParams(location.search).has("h") &&
      isStandalone() &&
      getSessionToken() === null,
  );
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    const token = params.get("h");
    if (token === null) return;
    // Spent or useless from here on: never leave it in the address bar, history, or router state.
    params.delete("h");
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
    if (!isStandalone() || getSessionToken() !== null) return;
    void (async () => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const sessionToken = await redeemHandoffToken(token, timeZone);
      if (sessionToken !== null) {
        setSessionToken(sessionToken);
        if (pushSupport() === "ready") {
          markPushAsked();
          setPrompt(true);
        }
      }
      setRedeeming(false);
    })();
    // Mount only: the token is read once, and `navigate` changes the location it came from.
  }, []);

  // Wait for the exchange so the first screen never flashes signed out.
  if (redeeming) {
    return (
      <main aria-busy="true" className="mx-auto max-w-xl p-5">
        <p className="py-16 text-center text-xl text-ink-soft">
          {t.common.loading}
        </p>
      </main>
    );
  }
  return (
    <>
      {children}
      {prompt && <PushPromptSheet onClose={() => setPrompt(false)} />}
    </>
  );
}
