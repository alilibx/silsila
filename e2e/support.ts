import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";

const run = promisify(execFile);

/** A valid-looking UAE mobile number nobody has used before: country code + 50 + seven random digits. */
export function randomPhone(): string {
  const tail = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  return `97150${tail}`;
}

/**
 * Stands in for the person pressing "send" in WhatsApp: hands the verification message to the
 * dev-only `dev:simulateIncoming` action, exactly as the webhook would.
 */
export async function simulateIncoming(
  from: string,
  text: string,
): Promise<void> {
  await run(
    "pnpm",
    [
      "exec",
      "convex",
      "run",
      "dev:simulateIncoming",
      JSON.stringify({ from, text }),
    ],
    { cwd: new URL("..", import.meta.url).pathname },
  );
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
