import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { normalizeDigits } from "@convex/lib/digits";
import { Button } from "@web/components/Button";
import { convexSiteUrl } from "@web/lib/env";
import { deviceLabel } from "@web/lib/format";
import { getClientKey } from "@web/lib/session";
import { waLink } from "@web/lib/whatsapp";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { t } from "../i18n/ar";
import { setAdminToken } from "../lib/adminSession";

const PIN_LENGTH = 6;

type ErrorCode = keyof typeof t.signIn.errors;

type Started = {
  verificationId: string;
  secret: string;
  waNumber: string;
  message: string;
};

/** Opened inside the click, before any await, so the popup blocker allows it. */
function openBlankWindow(): Window | null {
  try {
    const win = window.open("about:blank", "_blank");
    if (win) win.opener = null;
    return win;
  } catch {
    return null;
  }
}

function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && code in t.signIn.errors;
}

/**
 * Admin sign-in (spec 4.2): WhatsApp a ready-made code, then type the 6-digit
 * code WhatsApp sends back. Always the code step, even on a known browser.
 */
export function SignInPage() {
  const [started, setStarted] = useState<Started | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pasteEmpty, setPasteEmpty] = useState(false);
  // Some browsers have no clipboard API at all, whatever the types say.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const canPaste = typeof clipboard?.readText === "function";
  const confirmPin = useAction(api.adminAuth.confirmPin);
  const live = useQuery(
    api.verification.status,
    started
      ? {
          verificationId: started.verificationId as Id<"verifications">,
          secret: started.secret,
        }
      : "skip",
  );

  const statusError: ErrorCode | null =
    live?.status === "expired" || live?.status === "rejected"
      ? live.status
      : null;
  const shownError = statusError ?? error;
  const terminal =
    statusError !== null ||
    error === "too_many_attempts" ||
    error === "expired";
  const askPin = started !== null && live?.status === "needs_pin" && !terminal;

  function reset() {
    setStarted(null);
    setPin("");
    setError(null);
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const win = openBlankWindow();
    try {
      const res = await fetch(
        `${convexSiteUrl()}/api/admin/verification/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey: getClientKey() }),
        },
      );
      const body = (await res.json().catch(() => null)) as
        (Started & { error?: undefined }) | { error: string } | null;
      if (!res.ok || body === null || body.error !== undefined) {
        win?.close();
        const code = body?.error;
        setError(isErrorCode(code) ? code : "generic");
        return;
      }
      const link = waLink(body.waNumber, body.message);
      if (win) win.location.href = link;
      else window.location.href = link;
      setStarted(body);
    } catch {
      win?.close();
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  /** Fills the field from what WhatsApp's "copy code" button copied (the browser may ask first). */
  async function paste() {
    let text = "";
    try {
      text = (await clipboard?.readText()) ?? "";
    } catch {
      // Refused or unreadable: same as an empty clipboard.
    }
    const digits = normalizeDigits(text).replace(/\D/gu, "");
    setPasteEmpty(digits.length !== PIN_LENGTH);
    if (digits.length === PIN_LENGTH) setPin(digits);
  }

  async function confirm() {
    if (!started || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmPin({
        verificationId: started.verificationId as Id<"verifications">,
        secret: started.secret,
        pin,
        deviceLabel: deviceLabel(navigator.userAgent),
      });
      if ("adminToken" in res) setAdminToken(res.adminToken);
      else setError(res.error);
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-6">
      <h1 className="text-center font-display text-3xl text-green-deep">
        {t.signIn.title}
      </h1>
      {shownError !== null && (
        <p
          role="alert"
          className="rounded-ui bg-saffron-soft p-3 text-center text-saffron-ink"
        >
          {t.signIn.errors[shownError]}
        </p>
      )}

      {started === null && (
        <>
          <p className="text-center leading-relaxed text-ink-soft">
            {t.signIn.intro}
          </p>
          <Button variant="whatsapp" disabled={busy} onClick={start}>
            {t.signIn.start}
          </Button>
        </>
      )}

      {started !== null && terminal && (
        <Button variant="ghost" onClick={reset}>
          {t.signIn.again}
        </Button>
      )}

      {started !== null && !terminal && !askPin && (
        <>
          <p className="text-center text-lg">{t.signIn.waiting}</p>
          <a
            href={waLink(started.waNumber, started.message)}
            target="_blank"
            rel="noreferrer"
            className="text-center font-medium text-green underline underline-offset-4"
          >
            {t.signIn.openAgain}
          </a>
        </>
      )}

      {askPin && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <label className="flex flex-col gap-2 text-center">
            <span>{t.signIn.pinLabel}</span>
            <input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setPasteEmpty(false);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={12}
              dir="ltr"
              className="rounded-ui border-2 border-line bg-white p-3 text-center text-2xl tracking-[0.4em]"
            />
          </label>
          {pasteEmpty && (
            <p role="alert" className="text-center text-saffron-ink">
              {t.signIn.pinPasteEmpty}
            </p>
          )}
          {canPaste && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void paste()}
            >
              {t.signIn.pinPaste}
            </Button>
          )}
          <Button type="submit" disabled={busy || pin.trim() === ""}>
            {t.signIn.confirm}
          </Button>
        </form>
      )}
    </main>
  );
}
