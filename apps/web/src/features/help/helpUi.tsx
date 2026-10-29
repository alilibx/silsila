import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { RetryBoundary } from "../../components/RetryBoundary";
import { HelpSheet } from "./HelpSheet";

type OpenOptions = { requestId?: string; screenshot?: Blob | null };

type HelpUi = {
  openSheet(options?: OpenOptions): void;
  buttonHidden: boolean;
  setButtonHidden(hidden: boolean): void;
};

const Ctx = createContext<HelpUi | null>(null);

/** Holds the help sheet and the "؟" button's visibility for the whole website. */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{
    requestId: string | null;
    screenshot: Blob | null;
  } | null>(null);
  const [hiders, setHiders] = useState(0);

  const openSheet = useCallback((options: OpenOptions = {}) => {
    setSheet({
      requestId: options.requestId ?? null,
      screenshot: options.screenshot ?? null,
    });
  }, []);
  const setButtonHidden = useCallback((hidden: boolean) => {
    setHiders((n) => Math.max(0, n + (hidden ? 1 : -1)));
  }, []);

  const value = useMemo(
    () => ({ openSheet, buttonHidden: hiders > 0, setButtonHidden }),
    [openSheet, hiders, setButtonHidden],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {sheet && (
        // Outside the page's boundary: a failed help query retries here, not app-wide.
        <RetryBoundary resetKey={sheet.requestId ?? "new"} quiet>
          <HelpSheet
            requestId={sheet.requestId}
            screenshot={sheet.screenshot}
            onClose={() => setSheet(null)}
          />
        </RetryBoundary>
      )}
    </Ctx.Provider>
  );
}

/** Outside the provider (a page rendered on its own in a test) nothing opens. */
const NO_HELP_UI: HelpUi = {
  openSheet: () => undefined,
  buttonHidden: false,
  setButtonHidden: () => undefined,
};

export function useHelpUi(): HelpUi {
  return useContext(Ctx) ?? NO_HELP_UI;
}

/** Hides the "؟" button while the calling screen is mounted (the celebration). */
export function useHideHelpButton(): void {
  // Only the stable setter: depending on the whole context would re-run on every change.
  const setHidden = useContext(Ctx)?.setButtonHidden;
  useEffect(() => {
    if (!setHidden) return;
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);
}
