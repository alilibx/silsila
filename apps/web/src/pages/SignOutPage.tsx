import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, buttonClass } from "../components/Button";
import { t } from "../i18n/ar";
import { clearSessionToken, getSessionToken } from "../lib/session";

type Outcome = "kept" | "all" | "invalid";

const OUTCOMES: readonly Outcome[] = ["kept", "all", "invalid"];
const PREFIX = "silsila.signout.";
const LAST_KEY = `${PREFIX}last`;

/** A short, non-secret key for the token, so the token itself is never written to storage. */
function keyFor(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash = Math.imul(hash ^ token.charCodeAt(i), 0x01000193);
  }
  return PREFIX + (hash >>> 0).toString(16);
}

function readOutcome(key: string | null): Outcome | null {
  try {
    const stored = key && sessionStorage.getItem(key);
    return OUTCOMES.find((o) => o === stored) ?? null;
  } catch {
    return null;
  }
}

function saveOutcome(key: string, outcome: Outcome): void {
  try {
    sessionStorage.setItem(key, outcome);
    sessionStorage.setItem(LAST_KEY, key);
  } catch {
    // Without storage a reload simply asks the server again.
  }
}

function lastKey(): string | null {
  try {
    return sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/**
 * The "not me" link from a sign-in alert. The alert token is single use, so the server is asked
 * once per token and the answer is remembered for this tab: a reload, or StrictMode's second
 * effect, must not turn "done" into "link no longer valid".
 */
export function SignOutPage() {
  const [search] = useSearchParams();
  // Captured on first render; the address bar is cleaned right after.
  const [token] = useState(() => search.get("t"));
  const key = token ? keyFor(token) : null;
  const [outcome, setOutcome] = useState<Outcome | null>(() =>
    // Reloaded without `t`: show what this tab last learned, else the link is not usable.
    token ? readOutcome(key) : (readOutcome(lastKey()) ?? "invalid"),
  );
  const [failed, setFailed] = useState(false);
  const signOutOthers = useMutation(api.sessions.signOutOthersByAlertToken);
  const started = useRef(false);

  useEffect(() => {
    if (!new URLSearchParams(location.search).has("t")) return;
    const params = new URLSearchParams(location.search);
    params.delete("t");
    const query = params.toString();
    history.replaceState(
      history.state,
      "",
      location.pathname + (query ? `?${query}` : "") + location.hash,
    );
  }, []);

  async function run(alertToken: string, storeKey: string) {
    started.current = true;
    setFailed(false);
    try {
      const result = await signOutOthers({
        alertToken,
        sessionToken: getSessionToken() ?? undefined,
      });
      let next: Outcome = "invalid";
      if (result.ok) {
        next = result.keptCurrent ? "kept" : "all";
        if (!result.keptCurrent) clearSessionToken();
      }
      saveOutcome(storeKey, next);
      setOutcome(next);
    } catch {
      started.current = false;
      setFailed(true);
    }
  }

  useEffect(() => {
    if (token === null || key === null || outcome !== null || started.current) {
      return;
    }
    void run(token, key);
    // Fires once per token on mount; `started` guards StrictMode's second effect.
  }, []);

  return (
    <main
      aria-busy={outcome === null && !failed}
      className="mx-auto flex max-w-xl flex-col gap-6 p-5 pt-16 text-center"
    >
      {outcome !== null ? (
        <p
          role="status"
          className="font-display text-3xl leading-snug text-green-deep"
        >
          {t.signOut[outcome]}
        </p>
      ) : failed ? (
        <>
          <p role="alert" className="text-xl font-medium text-[#8A2B1E]">
            {t.signOut.error}
          </p>
          {token && key && (
            <Button variant="ghost" onClick={() => void run(token, key)}>
              {t.signOut.retry}
            </Button>
          )}
        </>
      ) : (
        <p className="text-xl text-ink-soft">{t.common.loading}</p>
      )}
      <Link to="/" className={buttonClass("ghost", "text-green")}>
        {t.common.home}
      </Link>
    </main>
  );
}
