import { expect } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import { blockExternal, test } from "./support";

/** How long a cheap phone on a slow network may wait before it can start a khatma. */
const FIRST_LOAD_BUDGET_MS = 8_000;

// A first visit on a slow phone: from a cold cache to a home screen someone can use, within the
// budget. Only the throttled project runs it (playwright.config.ts); on a fast connection it
// would always pass.
test("first load on a slow phone stays within budget", async ({ page }) => {
  await blockExternal(page.context());

  const started = Date.now();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: t.home.startNewPlain }),
  ).toBeVisible({ timeout: FIRST_LOAD_BUDGET_MS * 2 });
  const elapsed = Date.now() - started;

  // How much the browser downloaded, as sent over the network (compressed where the server compresses).
  const transferred = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .concat(performance.getEntriesByType("navigation"))
      .reduce(
        (sum, entry) =>
          sum + ((entry as PerformanceResourceTiming).transferSize ?? 0),
        0,
      ),
  );
  test.info().annotations.push(
    { type: "first load", description: `${elapsed} ms` },
    {
      type: "transferred",
      description: `${Math.round(transferred / 1024)} KB`,
    },
  );
  expect(elapsed).toBeLessThan(FIRST_LOAD_BUDGET_MS);
});
