/**
 * Renders every scripts/images/*.html to a PNG in apps/web/public/ at the size
 * the page declares: <meta name="render-size" content="1200x630" />.
 *
 *   pnpm exec tsx scripts/render-images.ts
 *
 * Needs Playwright's Chromium (`pnpm exec playwright install chromium`).
 */
import { readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url);
const imagesDir = new URL("scripts/images/", root).pathname;
const outDir = new URL("apps/web/public/", root).pathname;

const browser = await chromium.launch();
try {
  const files = (await readdir(imagesDir)).filter((f) => f.endsWith(".html"));
  for (const file of files) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(imagesDir, file)).href);
    const size = await page
      .locator('meta[name="render-size"]')
      .getAttribute("content");
    const match = /^(\d+)x(\d+)$/.exec(size ?? "");
    if (!match) throw new Error(`${file}: missing <meta name="render-size">`);
    await page.setViewportSize({
      width: Number(match[1]),
      height: Number(match[2]),
    });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png" });
    const out = join(outDir, `${basename(file, ".html")}.png`);
    await writeFile(out, png);
    console.log(`${file} -> ${out} (${size})`);
    await page.close();
  }
} finally {
  await browser.close();
}
