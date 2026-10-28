import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

export type ShareSheet = "invite" | "created" | "remind" | null;

/** True when the navigation state carries `key: true`. */
function flag(state: unknown, key: string): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    key in state &&
    (state as Record<string, unknown>)[key] === true
  );
}

/**
 * Which share sheet is open on the khatma page. A khatma that was just created opens its invite
 * sheet once: the creator arrives with `state.justCreated` (or `state.openInvite` after the
 * organizer reset the link, for the plain title). Either flag is cleared right away so a
 * reload or a back-navigation does not open it again.
 */
export function useShareSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const justCreated = flag(location.state, "justCreated");
  const arrived = justCreated || flag(location.state, "openInvite");
  const [sheet, setSheet] = useState<ShareSheet>(
    justCreated ? "created" : arrived ? "invite" : null,
  );

  useEffect(() => {
    if (!arrived) return;
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [arrived, navigate, location.pathname, location.search]);

  return {
    sheet,
    openInvite: () => setSheet("invite"),
    openRemind: () => setSheet("remind"),
    close: () => setSheet(null),
  };
}
