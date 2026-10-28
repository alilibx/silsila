import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..");

describe("privacy policy", () => {
  // Meta's app review reads this URL, so it must serve the static page, not the SPA fallback.
  it("/privacy is rewritten to the static page before the SPA catch-all", () => {
    const config = JSON.parse(
      readFileSync(join(WEB, "vercel.json"), "utf8"),
    ) as { rewrites: { source: string; destination: string }[] };
    const sources = config.rewrites.map((r) => r.source);
    const privacy = sources.indexOf("/privacy");
    expect(privacy).toBeGreaterThanOrEqual(0);
    expect(config.rewrites[privacy]?.destination).toBe("/privacy.html");
    expect(privacy).toBeLessThan(sources.indexOf("/(.*)"));
  });

  it("the page is readable without JavaScript, in Arabic and English", () => {
    const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('id="en" lang="en" dir="ltr"');
    expect(html).toContain("support@manzilo.com");
  });
});

/** The text between a heading and the next one. */
function section(html: string, heading: string): string {
  const start = html.indexOf(`<h2>${heading}</h2>`);
  if (start < 0) return "";
  const end = html.indexOf("<h2>", start + 1);
  return html.slice(start, end < 0 ? undefined : end);
}

describe("privacy policy: help requests", () => {
  const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");

  it("explains help requests in Arabic, with their own retention", () => {
    const ar = section(html, "طلبات المساعدة");
    expect(ar).not.toBe("");
    for (const words of ["صورة الشاشة", "تسجيل صوتي", "٣٠ يوماً", "١٨٠ يوماً"]) {
      expect(ar).toContain(words);
    }
  });

  it("explains help requests in English too", () => {
    const en = section(html, "Help requests");
    expect(en).not.toBe("");
    for (const words of ["screenshot", "voice note", "30 days", "180 days"]) {
      expect(en).toContain(words);
    }
  });
});
