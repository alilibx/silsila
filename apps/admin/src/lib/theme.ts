import { useState } from "react";

const KEY = "wirdak.admin.theme";

function stored(): "light" | "dark" | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Private windows can refuse storage; the system theme still works.
    return null;
  }
}

function isDark(): boolean {
  const choice = stored();
  if (choice !== null) return choice === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function paint(dark: boolean): void {
  document.documentElement.classList.toggle("dark", dark);
}

/** Runs before the first render, so a dark page never flashes light. */
export function applyStoredTheme(): void {
  paint(isDark());
}

/** The current theme and a toggle that remembers the admin's choice. */
export function useTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState(isDark);
  return {
    dark,
    toggle: () => {
      const next = !dark;
      paint(next);
      setDark(next);
      try {
        localStorage.setItem(KEY, next ? "dark" : "light");
      } catch {
        // Not remembered, but it still applies for this visit.
      }
    },
  };
}
