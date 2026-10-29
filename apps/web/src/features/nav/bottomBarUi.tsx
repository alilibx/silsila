import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type BottomBarUi = { hidden: boolean; setHidden(hidden: boolean): void };

const Ctx = createContext<BottomBarUi | null>(null);

/** Holds whether any mounted screen has asked to hide the bottom bar. */
export function BottomBarProvider({ children }: { children: ReactNode }) {
  const [hiders, setHiders] = useState(0);
  const setHidden = useCallback((hidden: boolean) => {
    setHiders((n) => Math.max(0, n + (hidden ? 1 : -1)));
  }, []);
  const value = useMemo(
    () => ({ hidden: hiders > 0, setHidden }),
    [hiders, setHidden],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Outside the provider (a page rendered on its own in a test) nothing is hidden. */
export function useBottomBarHidden(): boolean {
  return useContext(Ctx)?.hidden ?? false;
}

/** Hides the bottom bar while the calling screen is mounted (the celebration). */
export function useHideBottomBar(): void {
  // Only the stable setter: depending on the whole context would re-run on every change.
  const setHidden = useContext(Ctx)?.setHidden;
  // A layout effect hides the bar before the screen first paints, so it never flashes over it.
  useLayoutEffect(() => {
    if (!setHidden) return;
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);
}
