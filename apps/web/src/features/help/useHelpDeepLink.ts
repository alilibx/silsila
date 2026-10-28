import { useEffect } from "react";
import { useHelpUi } from "./helpUi";

/**
 * A reply push opens `/?help=<id>`. Read here, at the app level, because the
 * home page may move on to a pending take before it would see the query.
 */
export function useHelpDeepLink(): void {
  const { openSheet } = useHelpUi();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get("help");
    if (!requestId) return;
    params.delete("help");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    openSheet({ requestId });
  }, [openSheet]);
}
