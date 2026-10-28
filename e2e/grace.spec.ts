import { expect, test, type Browser, type Page } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import {
  blockExternal,
  dismissPushPrompt,
  forceGraceEnd,
  randomPhone,
  verifyInSheet,
} from "./support";

const KHATMA_NAME = "ختمة الأسرة";
/** What the organizer's note says for one juz' that went back to the pool (any reason, same words). */
const openNote = (juz: string) => `الجزء ${juz} متاح لمن يساعد`;
const juzTile = (page: Page, juz: string) =>
  page.getByRole("button", { name: new RegExp(`^${t.tile.juz(juz)}،`) });

/** A creates a weekly khatma (so A is the organizer) and returns the invite link. */
async function startKhatma(page: Page): Promise<string> {
  const aName = `علي ${Math.floor(Math.random() * 1e6)}`;
  await blockExternal(page.context());
  await page.goto("/");
  await page.getByRole("link", { name: t.home.startNewPlain }).click();
  await page.getByLabel(new RegExp(t.create.nameLabel)).fill(KHATMA_NAME);
  await page.getByRole("button", { name: t.create.submit }).click();
  await verifyInSheet(page, aName, randomPhone());

  const invite = page.getByRole("dialog", { name: t.share.createdTitle });
  const inviteText = await invite.getByText(/\/j\//).innerText();
  const inviteUrl = inviteText.match(/https?:\/\/\S+/)?.[0];
  expect(inviteUrl).toBeDefined();
  await invite.getByRole("button", { name: t.share.done }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: KHATMA_NAME }),
  ).toBeVisible();
  return inviteUrl ?? "";
}

/** B, in a clean browser context, follows the invite, verifies, and takes `juz`. */
async function joinAndTake(browser: Browser, inviteUrl: string, juz: string) {
  const context = await browser.newContext();
  await blockExternal(context);
  const b = await context.newPage();
  await b.goto(inviteUrl);
  await juzTile(b, juz).click();
  await verifyInSheet(
    b,
    `سارة ${Math.floor(Math.random() * 1e6)}`,
    randomPhone(),
  );
  await b
    .getByRole("dialog")
    .getByRole("button", { name: t.take.confirm })
    .click();
  await expect(b.getByText(t.card.held)).toBeVisible();
  await dismissPushPrompt(b);
  await expect(
    b.getByRole("button", { name: new RegExp(t.tile.mine) }),
  ).toHaveCount(1);
  return { b, context };
}

// Grace end (forced through the dev helper): the juz' opens for everyone else, the organizer is
// told in words that name nobody, takes it from the note, and the reader is thanked.
test("grace end: juz opens, organizer is told and takes it, reader is thanked", async ({
  page,
  browser,
}) => {
  const inviteUrl = await startKhatma(page);
  const code = new URL(inviteUrl).pathname.split("/j/")[1] ?? "";
  expect(code).not.toBe("");
  const { b, context } = await joinAndTake(browser, inviteUrl, "٥");
  try {
    await forceGraceEnd(code, 5);

    // A: tile 5 reads "open" with no name, and the note offers it.
    await page.reload();
    const tile = juzTile(page, "٥");
    await expect(tile).toContainText(t.tile.open);
    await expect(tile).not.toContainText(t.tile.reading);
    await expect(page.getByText(openNote("٥"))).toBeVisible();

    // A takes it from the note.
    await page.getByRole("button", { name: t.notes.takeJuz }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: t.take.confirm })
      .click();
    await expect(page.getByText(t.card.held)).toBeVisible();
    await dismissPushPrompt(page);
    await expect(
      page.getByRole("button", { name: new RegExp(t.tile.mine) }),
    ).toHaveCount(1);

    // B: thanked, and no longer holds it.
    await b.reload();
    await expect(
      b.getByText(
        t.notes.text({
          kind: "thanks",
          juz: [5],
          count: null,
          until: null,
        }),
      ),
    ).toBeVisible();
    await expect(b.getByText(t.card.held)).toBeHidden();
  } finally {
    await context.close();
  }
});

// "I can't finish it" reaches the organizer with the same wording as a timeout.
test("release: the organizer's note reads the same as for a timeout", async ({
  page,
  browser,
}) => {
  const inviteUrl = await startKhatma(page);
  const { b, context } = await joinAndTake(browser, inviteUrl, "٦");
  try {
    await b.getByRole("button", { name: t.card.release }).click();
    await b
      .getByRole("dialog")
      .getByRole("button", { name: t.release.confirm })
      .click();
    await expect(b.getByText(t.card.held)).toBeHidden();

    await page.reload();
    await expect(page.getByText(openNote("٦"))).toBeVisible();
    await expect(juzTile(page, "٦")).toContainText(t.tile.open);
  } finally {
    await context.close();
  }
});
