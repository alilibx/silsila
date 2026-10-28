import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useSessionToken } from "../../lib/session";

type State = { url: string | null; failed: boolean };

/**
 * The member's own link to a khatma (`/j/<code>?from=<share token>`). Fetches the share token
 * once when the sheet using it opens, even if StrictMode runs the effect twice. `url` stays null
 * until it arrives, or for good if it fails.
 */
export function useShareUrl(inviteCode: string): State {
  const sessionToken = useSessionToken();
  const ensureShareToken = useAction(api.khatmas.ensureShareToken);
  const [state, setState] = useState<State>({ url: null, failed: false });
  const requested = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const key = `${sessionToken ?? ""}|${inviteCode}`;
    if (requested.current === key) return;
    requested.current = key;
    ensureShareToken({ sessionToken, inviteCode }).then(
      ({ shareToken }) => {
        if (!mounted.current) return;
        const from = encodeURIComponent(shareToken);
        setState({
          url: `${location.origin}/j/${encodeURIComponent(inviteCode)}?from=${from}`,
          failed: false,
        });
      },
      () => {
        if (mounted.current) setState({ url: null, failed: true });
      },
    );
  }, [ensureShareToken, sessionToken, inviteCode]);

  return state;
}
