import { expect } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import {
  allowRota,
  blockExternal,
  randomPhone,
  test,
  verifyInSheet,
} from "./support";

const KHATMA_NAME = "ختمة التناوب";

/** Today's date in the browser's time zone as `YYYY-MM-DD` (the backend uses the same zone). */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// A rotating khatma from start to a first day: A signs in, an admin-style switch lets A create one,
// A makes it daily from today, adds two people, reassigns an unread juz' to themselves, records it
// as read, and then pauses the khatma. Before 08:00 the first day has not started yet, so the
// test stops at the line saying when it will.
test("rota: create, place people, run a day", async ({ page }) => {
  const aName = `علي ${Math.floor(Math.random() * 1e6)}`;
  const aPhone = randomPhone();
  await blockExternal(page.context());

  // --- A signs in, then an admin allows rotating khatmas -------------------------------------
  await page.goto("/");
  await page.getByRole("button", { name: t.signIn.button }).click();
  await verifyInSheet(page, aName, aPhone);
  await expect(page.getByRole("dialog")).toBeHidden();
  await allowRota(aPhone);

  // --- Step 1: the kind, the name, the days, the start ---------------------------------------
  await page.goto("/new");
  await page.getByRole("link", { name: new RegExp(t.rota.rotaTitle) }).click();
  await page.getByLabel(t.rota.nameQuestion).fill(KHATMA_NAME);
  await expect(
    page.getByRole("radio", { name: t.rota.daily, exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: `${t.rota.startLabel}: ${t.rota.change}` })
    .click();
  await page.getByLabel(t.rota.startDateInput).fill(today());
  await page.getByRole("button", { name: t.rota.next }).click();

  // --- Step 2: two people --------------------------------------------------------------------
  await expect(
    page.getByRole("heading", { level: 1, name: t.rota.setupTitle }),
  ).toBeVisible();
  const people = page.getByRole("list", { name: t.rota.peopleList });
  for (const name of ["سارة", "خالد"]) {
    await page.getByLabel(t.rota.personName).fill(name);
    await page.getByLabel(t.rota.personPhone).fill(`+${randomPhone()}`);
    await page.getByRole("button", { name: t.rota.add, exact: true }).click();
    await expect(people.getByText(name)).toBeVisible();
  }
  await expect(people.getByRole("listitem")).toHaveCount(3);
  await page.getByRole("link", { name: t.rota.done }).click();

  // --- Today ---------------------------------------------------------------------------------
  await expect(
    page.getByRole("heading", { level: 1, name: KHATMA_NAME }),
  ).toBeVisible();
  const grid = page.getByRole("region", { name: t.rota.gridLabel });
  const notStarted = page.getByText(/^تبدأ الختمة ١ /);
  await expect(grid.or(notStarted)).toBeVisible();
  if (await notStarted.isVisible()) {
    // Before the day's message time: the first day is still ahead, so there is nothing to run.
    return;
  }

  const unread = (juz: number) =>
    page.getByRole("button", {
      name: t.rota.tileLabel(juz, t.rota.legendUnread),
    });
  await expect(page.getByText(t.rota.progress(0, 30))).toBeVisible();
  await expect(grid.getByRole("button")).toHaveCount(30);

  // Juz' 30 is nobody's yet: A takes it and records it.
  await unread(30).click();
  await page.getByRole("button", { name: t.rota.readMyself }).click();
  const reassigned = page.getByRole("button", {
    name: t.rota.tileLabel(30, t.rota.legendReassigned),
  });
  await expect(reassigned).toBeVisible();
  await reassigned.click();
  await page.getByRole("button", { name: t.rota.markDone }).click();
  await expect(
    page.getByRole("button", { name: t.rota.tileLabel(30, t.rota.legendDone) }),
  ).toBeVisible();
  await expect(page.getByText(t.rota.progress(1, 30))).toBeVisible();

  // --- Pause ---------------------------------------------------------------------------------
  await page.getByRole("link", { name: t.khatmaSettings.link }).click();
  const pause = page.getByRole("switch", { name: t.rota.pauseNow });
  await expect(pause).toHaveAttribute("aria-checked", "false");
  await pause.click();
  await expect(pause).toHaveAttribute("aria-checked", "true");
  await page.goBack();
  await expect(page.getByText(t.rota.pausedBanner)).toBeVisible();
});
