import { useState } from "react";
import { t } from "../../i18n/ar";
import { androidIntentUrl, inAppBrowser } from "../../lib/inAppBrowser";
import { useSessionToken } from "../../lib/session";

const DISMISSED = "wirdak.openInBrowserDismissed";

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

/**
 * Inside WhatsApp's (or Facebook's) own browser, which keeps its own storage, a
 * person signed in in Safari or Chrome shows as signed out. Links in WhatsApp
 * templates always open there, so this offers the way out: an intent link on
 * Android, and on iPhone (where a page can't open Safari) the menu step plus a
 * copy of the link. Hidden once someone is signed in here, or for this visit
 * after "not now".
 */
// TEMP (ARQ-275): what this browser reports, to tune inAppBrowser(); remove after.
function Diag() {
  if (!window.location.search.includes("diag=ua")) return null;
  const nav = navigator as Navigator & { standalone?: boolean };
  const w = window as unknown as Record<string, unknown>;
  return (
    <pre
      dir="ltr"
      className="mx-4 mt-3 overflow-x-auto rounded-ui bg-white p-3 text-xs whitespace-pre-wrap"
    >
      {JSON.stringify(
        {
          ua: nav.userAgent,
          standalone:
            nav.standalone === undefined ? "undefined" : nav.standalone,
          webkitHandlers: typeof (
            w.webkit as { messageHandlers?: unknown } | undefined
          )?.messageHandlers,
          share: typeof nav.share,
          detected: inAppBrowser(),
        },
        null,
        1,
      )}
    </pre>
  );
}

export function OpenInBrowser() {
  return (
    <>
      <Diag />
      <Banner />
    </>
  );
}

function Banner() {
  const sessionToken = useSessionToken();
  const [kind] = useState(() => inAppBrowser());
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [copied, setCopied] = useState(false);
  if (kind === null || sessionToken || dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED, "1");
    } catch {
      // This visit only, then.
    }
    setDismissed(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Nothing to copy with; the menu step still works.
    }
  }

  const action =
    "shrink-0 rounded-full bg-green px-3 py-1.5 font-semibold text-white";
  return (
    <div className="mx-auto max-w-xl px-4 pt-3">
      <div
        role="status"
        className="flex flex-col gap-2 rounded-ui bg-saffron-soft px-4 py-3 text-sm text-saffron-ink"
      >
        <p>{t.openInBrowser.body}</p>
        {kind === "ios" && <p>{t.openInBrowser.iosHint}</p>}
        <div className="flex flex-wrap items-center gap-3">
          {kind === "android" ? (
            <a className={action} href={androidIntentUrl(window.location.href)}>
              {t.openInBrowser.open}
            </a>
          ) : (
            <button
              type="button"
              className={action}
              onClick={() => void copy()}
            >
              {copied ? t.openInBrowser.copied : t.openInBrowser.copy}
            </button>
          )}
          <button
            type="button"
            className="font-semibold underline"
            onClick={dismiss}
          >
            {t.openInBrowser.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
