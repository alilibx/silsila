import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { useSessionToken } from "../../lib/session";

type State = { url: string | null; failed: boolean };

/**
 * The member's own link to a khatma (`/j/<code>?from=<share token>`). Fetches the share token
 * once when the sheet using it opens. `url` stays null until it arrives, or for good if it fails.
 */
export function useShareUrl(inviteCode: string): State {
  const sessionToken = useSessionToken();
  const ensureShareToken = useAction(api.khatmas.ensureShareToken);
  const [state, setState] = useState<State>({ url: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    ensureShareToken({ sessionToken, inviteCode }).then(
      ({ shareToken }) => {
        if (cancelled) return;
        const from = encodeURIComponent(shareToken);
        setState({
          url: `${location.origin}/j/${encodeURIComponent(inviteCode)}?from=${from}`,
          failed: false,
        });
      },
      () => {
        if (!cancelled) setState({ url: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ensureShareToken, sessionToken, inviteCode]);

  return state;
}
