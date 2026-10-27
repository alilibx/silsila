import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

export type ShareSheet = "invite" | "created" | "remind" | null;

/**
 * Which share sheet is open on the khatma page. A khatma that was just created opens its invite
 * sheet once: the creator arrives with `state.justCreated`, which is cleared right away so a
 * reload or a back-navigation does not open it again.
 */
export function useShareSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const justCreated =
    typeof location.state === "object" &&
    location.state !== null &&
    "justCreated" in location.state &&
    location.state.justCreated === true;
  const [sheet, setSheet] = useState<ShareSheet>(
    justCreated ? "created" : null,
  );

  useEffect(() => {
    if (!justCreated) return;
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [justCreated, navigate, location.pathname, location.search]);

  return {
    sheet,
    openInvite: () => setSheet("invite"),
    openRemind: () => setSheet("remind"),
    close: () => setSheet(null),
  };
}
