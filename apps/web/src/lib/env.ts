const CONVEX_CLOUD = /\.convex\.cloud\/?$/;

/**
 * The Convex HTTP actions URL. An explicit `VITE_CONVEX_SITE_URL` wins; otherwise a hosted
 * deployment's `https://<name>.convex.cloud` maps to `https://<name>.convex.site`. That lets the
 * Vercel build set only `VITE_CONVEX_URL` (which `convex deploy --cmd` provides). Anything else
 * (the local backend serves HTTP actions on another port) needs the explicit value: "" otherwise.
 */
export function deriveConvexSiteUrl(
  convexUrl: string | undefined,
  siteUrl: string | undefined,
): string {
  if (siteUrl) return siteUrl.replace(/\/+$/, "");
  if (convexUrl && CONVEX_CLOUD.test(convexUrl)) {
    return convexUrl.replace(CONVEX_CLOUD, ".convex.site");
  }
  return "";
}

/** The site URL for this build, read when called (so tests can stub the environment). */
export function convexSiteUrl(): string {
  return deriveConvexSiteUrl(
    import.meta.env.VITE_CONVEX_URL,
    import.meta.env.VITE_CONVEX_SITE_URL,
  );
}
