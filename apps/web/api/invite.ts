import { injectOg, previewTags, type PreviewData } from "../src/lib/og.js";

/**
 * Serves `/j/:code` (see vercel.json): the SPA shell with Open Graph tags that
 * name the khatma, so a link pasted into WhatsApp shows a useful preview.
 * Any failure falls back to the generic tags, which are never cached.
 */

const LOOKUP_TIMEOUT_MS = 1500;
const CACHE_REAL = "public, max-age=0, s-maxage=300";
const CACHE_GENERIC = "no-store";

function isPreview(x: unknown): x is PreviewData {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    (p["name"] === null || typeof p["name"] === "string") &&
    typeof p["createdAt"] === "number" &&
    typeof p["done"] === "number" &&
    typeof p["round"] === "number" &&
    (p["inviterName"] === null || typeof p["inviterName"] === "string")
  );
}

async function lookup(
  code: string,
  from: string,
  ip: string,
): Promise<PreviewData | null> {
  const site = process.env["WIRDAK_CONVEX_SITE_URL"];
  const secret = process.env["PREVIEW_SECRET"];
  if (!site || !secret || !code) return null;
  try {
    const url = new URL("/api/preview", site);
    url.searchParams.set("code", code);
    if (from) url.searchParams.set("from", from);
    const res = await fetch(url, {
      headers: { "X-Preview-Secret": secret, "X-Visitor-Ip": ip },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (res.status !== 200) return null;
    const body: unknown = await res.json();
    return isPreview(body) ? body : null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

    const [shell, preview] = await Promise.all([
      fetch(new URL("/index.html", url.origin)).catch(() => null),
      lookup(code, from, ip),
    ]);
    if (shell === null || !shell.ok) {
      return new Response("unavailable", {
        status: 502,
        headers: { "Cache-Control": CACHE_GENERIC },
      });
    }

    // The canonical page address: no share token in it.
    const pageUrl = new URL(`/j/${encodeURIComponent(code)}`, url.origin).href;
    const html = injectOg(await shell.text(), previewTags(preview, pageUrl));
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": preview === null ? CACHE_GENERIC : CACHE_REAL,
      },
    });
  },
};
