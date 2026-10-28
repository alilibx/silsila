import { api } from "@convex/_generated/api";
import { convexHttp } from "./convexHttp";
import { isIos, isStandalone } from "./push";

type Manifest = {
  id?: string;
  start_url?: string;
  scope?: string;
  icons?: { src: string; [key: string]: unknown }[];
  [key: string]: unknown;
};

/** The page's own manifest. index.html doesn't link it: see `linkPageManifest`. */
export const STATIC_MANIFEST = "/manifest.webmanifest";

function addManifestLink(href: string): HTMLLinkElement {
  const link = document.createElement("link");
  link.rel = "manifest";
  link.setAttribute("href", href);
  document.head.append(link);
  return link;
}

/**
 * WebKit reads the first manifest a page links as soon as it is linked, and keeps it for the
 * page's life (WebKit 235af19ef1, Safari 15): changing the link later does nothing. So index.html
 * links none. iPhone and iPad browser tabs wait for the hand-off manifest (`useHandoffManifest`),
 * and everyone else, the home-screen app included, gets the static one now.
 */
export function linkPageManifest(): void {
  if (isIos() && !isStandalone()) return;
  addManifestLink(STATIC_MANIFEST);
}

/** A single-use token for the home-screen app and how long it lives, or null when it can't be made. */
export async function createHandoffToken(
  sessionToken: string,
): Promise<{ token: string; ttlMs: number } | null> {
  try {
    const result = await convexHttp().action(api.handoff.create, {
      sessionToken,
    });
    return "token" in result ? result : null;
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
    id: absolute(base.id ?? "/"),
    start_url: absolute(`/?h=${encodeURIComponent(token)}`),
    scope: absolute(base.scope ?? "/"),
    icons: base.icons?.map((icon) => ({ ...icon, src: absolute(icon.src) })),
  };
}

/**
 * Extends the token in the page's manifest by its lifetime. The lifetime, "invalid" when the
 * server refuses (used, purged, or another session's), or null when it can't be reached.
 */
export async function extendHandoffToken(
  sessionToken: string,
  token: string,
): Promise<number | "invalid" | null> {
  try {
    const result = await convexHttp().action(api.handoff.extend, {
      sessionToken,
      token,
    });
    return "ttlMs" in result ? result.ttlMs : "invalid";
  } catch {
    return null;
  }
}

/**
 * Links a manifest whose `start_url` carries the hand-off token, so the home-screen app opens
 * with it. WebKit keeps the first manifest a page links, so a page links this one once and keeps
 * its token alive instead of swapping it. The token goes nowhere else: not the page's address,
 * not its history. Returns the link, or null when the static manifest can't be read.
 */
export async function linkHandoffManifest(
  token: string,
): Promise<HTMLLinkElement | null> {
  try {
    const response = await fetch(STATIC_MANIFEST);
    if (!response.ok) return null;
    const base = (await response.json()) as Manifest;
    const manifest = handoffManifest(base, token, window.location.origin);
    // Never revoked: the link stays for the page's life.
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(manifest)], {
        type: "application/manifest+json",
      }),
    );
    return addManifestLink(url);
  } catch {
    return null;
  }
}
