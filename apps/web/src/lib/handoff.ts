import { api } from "@convex/_generated/api";
import { convexHttp } from "./convexHttp";

type Manifest = {
  start_url?: string;
  scope?: string;
  icons?: { src: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

function manifestLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
}

/** A single-use token for the home-screen app, or null when it can't be made. */
export async function createHandoffToken(
  sessionToken: string,
): Promise<string | null> {
  try {
    const result = await convexHttp().action(api.handoff.create, {
      sessionToken,
    });
    return "token" in result ? result.token : null;
  } catch {
    return null;
  }
}

/** Trades a hand-off token for a session token; null when it is invalid, used, expired, or offline. */
export async function redeemHandoffToken(
  token: string,
  timeZone: string,
): Promise<string | null> {
  try {
    const result = await convexHttp().action(api.handoff.redeem, {
      token,
      timeZone,
    });
    return "sessionToken" in result ? result.sessionToken : null;
  } catch {
    return null;
  }
}

/**
 * The page's manifest with `start_url` set to `/?h=<token>`. A `blob:` manifest can't resolve
 * relative URLs, so every URL in it is made absolute.
 */
export function handoffManifest(
  base: Manifest,
  token: string,
  origin: string,
): Manifest {
  const absolute = (path: string) => new URL(path, origin).href;
  return {
    ...base,
    start_url: absolute(`/?h=${encodeURIComponent(token)}`),
    scope: absolute(base.scope ?? "/"),
    icons: base.icons?.map((icon) => ({ ...icon, src: absolute(icon.src) })),
  };
}

/**
 * Swaps the page's `<link rel="manifest">` for a per-person one whose `start_url` carries the
 * hand-off token, so the home-screen app opens with it. The token goes nowhere else: not the
 * page's address, not its history. Returns the function that puts the original link back.
 */
export async function installHandoffManifest(
  token: string,
): Promise<() => void> {
  const link = manifestLink();
  if (!link) return () => {};
  const original = link.getAttribute("href");
  try {
    const response = await fetch(link.href);
    if (!response.ok) return () => {};
    const base = (await response.json()) as Manifest;
    const manifest = handoffManifest(base, token, window.location.origin);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], {
        type: "application/manifest+json",
      }),
    );
    link.setAttribute("href", url);
    return () => {
      if (original !== null) link.setAttribute("href", original);
      URL.revokeObjectURL(url);
    };
  } catch {
    return () => {};
  }
}
