import { useEffect } from "react";
import { clearSessionToken, getSessionToken } from "./session";

/**
 * Clears a stored session token the server no longer recognises. `dead` is true once the server
 * has answered for this very token as signed out (a revoked or expired session); a stored token
 * alone proves nothing. The storage check skips a token that was replaced between render and effect.
 */
export function useClearDeadToken(
  sessionToken: string | undefined,
  dead: boolean,
): void {
  useEffect(() => {
    if (
      dead &&
      sessionToken !== undefined &&
      getSessionToken() === sessionToken
    ) {
      clearSessionToken();
    }
  }, [dead, sessionToken]);
}
