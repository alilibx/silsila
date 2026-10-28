/**
 * Renders every scripts/images/*.html to a PNG in apps/web/public/ at the size
 * the page declares: <meta name="render-size" content="1200x630" />.
 *
 * A page that makes several images lists each as
 * <meta name="render-output" content="icons/icon-192.png 192x192 #any" />
 * (output path under apps/web/public/, size, and the URL hash the page reads to pick a variant).
 * It then needs no render-size.
 *
 *   bun run tsx scripts/render-images.ts
 *
 * Needs Playwright's Chromium (`bun run playwright install chromium`).
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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
    const url = pathToFileURL(join(imagesDir, file)).href;
    await page.goto(url);
    const outputs = (
      await page
        .locator('meta[name="render-output"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("content") ?? ""))
    ).map((content) => {
      const [path, size, hash = ""] = content.split(" ");
      return { path: path ?? "", size: size ?? "", hash };
    });
    if (outputs.length === 0) {
      const size = await page
        .locator('meta[name="render-size"]')
        .getAttribute("content");
      outputs.push({
        path: `${basename(file, ".html")}.png`,
        size: size ?? "",
        hash: "",
      });
    }
    for (const output of outputs) {
      const match = /^(\d+)x(\d+)$/.exec(output.size);
      if (!match) throw new Error(`${file}: missing or bad render size`);
      await page.setViewportSize({
        width: Number(match[1]),
        height: Number(match[2]),
      });
      // A hash change alone doesn't reload, so load the variant afresh.
      await page.goto(url + output.hash);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: "png" });
      const out = join(outDir, output.path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, png);
      console.log(`${file} -> ${out} (${output.size})`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
