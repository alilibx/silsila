import { expect, test } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import { blockExternal, randomPhone, verifyInSheet } from "./support";

const KHATMA_NAME = "ختمة الأسرة";

// The core loop at phone size: A starts a khatma, takes and finishes a juz', takes another;
// B follows A's invite, verifies (surviving a tab reload mid-way), and takes one. B must see
// A's name on a "reading" tile only.
test("core loop: create, take, finish, invite, join", async ({
  page,
  browser,
}) => {
  const aName = `علي ${Math.floor(Math.random() * 1e6)}`;
  const bName = `سارة ${Math.floor(Math.random() * 1e6)}`;
  await blockExternal(page.context());

  // --- Person A: verify, create a weekly khatma ---------------------------------------------
  await page.goto("/");
  await page.getByRole("link", { name: t.home.startNewPlain }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: t.pages.create }),
  ).toBeVisible();
  await page.getByLabel(new RegExp(t.create.nameLabel)).fill(KHATMA_NAME);
  await expect(
    page.getByRole("radio", { name: new RegExp(t.schedules.weekly) }),
  ).toBeChecked();
  await page.getByRole("button", { name: t.create.submit }).click();

  await verifyInSheet(page, aName, randomPhone());

  // Created: the invite sheet opens with A's own link.
  const invite = page.getByRole("dialog", { name: t.share.createdTitle });
  await expect(invite).toBeVisible();
  const inviteText = await invite.getByText(/\/j\//).innerText();
  const inviteUrl = inviteText.match(/https?:\/\/\S+/)?.[0];
  expect(inviteUrl).toBeDefined();
  await invite.getByRole("button", { name: t.share.done }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: KHATMA_NAME }),
  ).toBeVisible();

  // --- Person A: take the suggested juz', finish it ------------------------------------------
  await page.getByRole("button", { name: t.card.take }).click();
  const takeSheet = page.getByRole("dialog");
  // On a shared phone the sheet says whose account takes the juz'.
  await expect(takeSheet).toContainText(t.take.as(aName));
  await expect(
    takeSheet.getByRole("button", { name: t.take.notYou(aName) }),
  ).toBeVisible();
  await takeSheet.getByRole("button", { name: t.take.confirm }).click();
  await expect(page.getByText(t.card.held)).toBeVisible();
  const mine = page.getByRole("button", { name: new RegExp(t.tile.mine) });
  await expect(mine).toHaveCount(1);
  const firstJuzLabel = (await mine.getAttribute("aria-label")) ?? "";

  await page.getByRole("button", { name: t.card.finish }).click();
  await expect(page.getByText(t.toast.finished)).toBeVisible();
  await expect(page.getByText(t.card.held)).toBeHidden();
  const doneName = firstJuzLabel.replace(t.tile.mine, t.tile.doneWord);
  await expect(
    page.getByRole("button", { name: doneName, exact: true }),
  ).toBeDisabled();
  // A done tile never shows a name, A's own included.
  expect(doneName).not.toContain(aName);

  // Take a second juz' so a "reading" tile with A's name exists when B looks.
  await page.getByRole("button", { name: t.card.take }).click();
  await takeSheet.getByRole("button", { name: t.take.confirm }).click();
  await expect(page.getByText(t.card.held)).toBeVisible();

  // --- Person B: a second, clean browser context ---------------------------------------------
  const bContext = await browser.newContext();
  try {
    await blockExternal(bContext);
    const b = await bContext.newPage();
    expect(b.viewportSize()).toEqual({ width: 390, height: 844 });
    await b.goto(inviteUrl ?? "");

    // "دعاك <A's name>": the invitation names its sender.
    await expect(b.getByRole("note")).toContainText(t.khatma.invited(aName));

    // Signed out: tapping take opens verification, then the take sheet for the same juz'.
    // The tab reloads while B is in WhatsApp (phones discard background tabs); the sheet
    // comes back on its own and carries on.
    await b.getByRole("button", { name: t.card.take }).click();
    await verifyInSheet(b, bName, randomPhone(), async () => {
      await b.reload();
      await expect(
        b.getByRole("dialog", { name: t.verify.beforeTake }),
      ).toBeVisible();
      await expect(
        b.getByRole("heading", { name: t.verify.waitingTitle }),
      ).toBeVisible();
    });
    await b
      .getByRole("dialog")
      .getByRole("button", { name: t.take.confirm })
      .click();
    await expect(b.getByText(t.card.held)).toBeVisible();

    // B sees A's name on exactly one tile: the one A is reading. Never on a done tile.
    const tiles = b.getByRole("button", {
      name: new RegExp(`^${t.tile.juz("")}`),
    });
    await expect(tiles).toHaveCount(30);
    const withA = tiles.filter({ hasText: aName });
    await expect(withA).toHaveCount(1);
    await expect(withA).toHaveAccessibleName(
      new RegExp(`${t.tile.reading}.*${aName}`),
    );
    await expect(withA).toBeDisabled();

    const done = tiles.filter({ has: b.getByText(t.tile.done) });
    await expect(done).toHaveCount(1);
    await expect(done).not.toContainText(aName);
    await expect(done).toHaveAccessibleName(doneName);

    // Nobody sees their own name on their own tile: B's tile says "you are reading it".
    await expect(
      b.getByRole("button", { name: new RegExp(t.tile.mine) }),
    ).toHaveCount(1);
  } finally {
    await bContext.close();
  }
});
