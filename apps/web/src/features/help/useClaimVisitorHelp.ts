import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useSessionToken } from "../../lib/session";
import { forgetReporterToken, getReporterToken } from "./reporterToken";

/**
 * Once someone signs in on a browser that asked for help signed out, their
 * requests move to the account and the browser's reporter token goes (spec 3.5).
 */
export function useClaimVisitorHelp(): void {
  const sessionToken = useSessionToken();
  const claim = useMutation(api.help.claimVisitorRequests);
  const started = useRef(false);
  useEffect(() => {
    const reporterToken = getReporterToken();
    if (!sessionToken || !reporterToken || started.current) return;
    started.current = true;
    claim({ sessionToken, reporterToken })
      .then(() => forgetReporterToken())
      .catch(() => {
        // Kept for the next load; the requests stay readable by the token meanwhile.
        started.current = false;
      });
  }, [sessionToken, claim]);
}
