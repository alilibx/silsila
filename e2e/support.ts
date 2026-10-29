import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import type { Throttle } from "./throttle";

const run = promisify(execFile);

/** A valid-looking UAE mobile number nobody has used before: country code + 50 + seven random digits. */
export function randomPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `97150${tail}`;
}

/** Runs an internal Convex function on the local backend (`bun run convex run`). */
async function convexRun(fn: string, args: object): Promise<void> {
  await run("bun", ["run", "convex", "run", fn, JSON.stringify(args)], {
    cwd: new URL("..", import.meta.url).pathname,
  });
}

/**
 * Stands in for the person pressing "send" in WhatsApp: hands the verification message to the
 * dev-only `dev:simulateIncoming` action, exactly as the webhook would.
 */
export async function simulateIncoming(
  from: string,
  text: string,
): Promise<void> {
  await convexRun("dev:simulateIncoming", { from, text });
}

/** Ends the grace of the current hold of `juz` now, instead of waiting hours (dev-only helper). */
export async function forceGraceEnd(
  inviteCode: string,
  juz: number,
): Promise<void> {
  await convexRun("dev:forceGraceEnd", { inviteCode, juz });
}

/** No test may reach WhatsApp or Google Fonts: both are blocked, so runs are offline and deterministic. */
export async function blockExternal(context: BrowserContext): Promise<void> {
  await context.route(
    /^https?:\/\/(wa\.me|api\.whatsapp\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (route) => route.abort(),
  );
}

/**
 * Runs the open verification sheet to the end as a new number: types the name, reads the
 * ready-made message from the "open WhatsApp" link, sends it as `phone`, and confirms.
 * `whileInWhatsApp` runs between reading the message and sending it, e.g. to reload the tab.
 */
export async function verifyInSheet(
  page: Page,
  displayName: string,
  phone: string,
  whileInWhatsApp?: () => Promise<void>,
): Promise<void> {
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(t.verify.nameLabel).fill(displayName);
  await sheet.getByRole("button", { name: t.verify.start }).click();

  // The link is the page's only copy of the message; "open again" also matches this name.
  const link = sheet.getByRole("link", { name: t.verify.openWhatsApp });
  const href = await link.getAttribute("href");
  expect(href).not.toBeNull();
  const message = new URL(href ?? "").searchParams.get("text");
  expect(message).toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}/);

  await whileInWhatsApp?.();
  await simulateIncoming(phone, message ?? "");

  await expect(
    sheet.getByText(t.verify.confirmTitle(displayName)),
  ).toBeVisible();
  await sheet.getByRole("button", { name: t.verify.yes }).click();
}

/** What the app offers once after a person's first juz' in a browser, and its "not now". */
const NOTIFY_OFFERS = [
  // Push, where the browser can do it now.
  { title: t.push.title, notNow: t.push.notNow },
  // An iPhone or iPad tab: push works only once the site is on the home screen.
  { title: t.install.title, notNow: t.install.notNow },
  // No push at all: notifications on WhatsApp instead.
  { title: t.whatsappNotes.sheetTitle, notNow: t.whatsappNotes.notNow },
];

/**
 * After a person's first juz' in a browser the app offers notifications once: push, the iPhone
 * install steps, or WhatsApp, depending on the browser. "Not now" closes whichever it is.
 */
export async function dismissPushPrompt(page: Page): Promise<void> {
  const sheets = NOTIFY_OFFERS.map(({ title }) =>
    page.getByRole("dialog", { name: title }),
  );
  const offer = sheets.reduce((either, sheet) => either.or(sheet));
  await expect(offer).toBeVisible();
  const index = await Promise.all(sheets.map((sheet) => sheet.isVisible()));
  const shown = NOTIFY_OFFERS[index.indexOf(true)];
  await offer.getByRole("button", { name: shown?.notNow }).click();
  await expect(offer).toBeHidden();
}

/** The current project's throttle, if it has one. */
export function projectThrottle(): Throttle | undefined {
  return test.info().project.metadata.throttle as Throttle | undefined;
}

/** Slows `page` to the project's throttle through the DevTools protocol, before it loads anything. */
async function throttle(page: Page): Promise<void> {
  const slow = projectThrottle();
  if (!slow) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: slow.latencyMs,
    downloadThroughput: (slow.downloadKbps * 1024) / 8,
    uploadThroughput: (slow.uploadKbps * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow.cpuSlowdown });
}

/** Fails the test on any uncaught error in `page`, whichever browser it shows up in. */
function failOnPageError(page: Page): void {
  page.on("pageerror", (error) => {
    expect
      .soft(error, `uncaught error in the page: ${error.message}`)
      .toBeUndefined();
  });
}

/**
 * Playwright's `test`, with the default `page` throttled for the project and watched for
 * uncaught errors. Every spec imports `test` from here.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await throttle(page);
    failOnPageError(page);
    await use(page);
  },
});

/**
 * Another person on another phone: a clean context with the project's device, external sites
 * blocked, the project's throttle, and uncaught errors failing the test. Close the context after.
 */
export async function newPerson(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await blockExternal(context);
  const page = await context.newPage();
  await throttle(page);
  failOnPageError(page);
  return { context, page };
}
