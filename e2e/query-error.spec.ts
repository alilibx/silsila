import { expect, type Page } from "@playwright/test";
import { t } from "../apps/web/src/i18n/ar";
import { blockExternal, test } from "./support";

/**
 * Sits between the page and the local Convex backend's WebSocket and turns the first result of
 * `udfPath` into the failure a real timeout produces. Every later result passes through.
 */
async function failFirstResult(page: Page, udfPath: RegExp): Promise<void> {
  let queryId: number | null = null;
  let failed = false;
  await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:3210\//, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (queryId === null && typeof message === "string") {
        const sent = JSON.parse(message) as {
          type: string;
          modifications?: { type: string; queryId: number; udfPath: string }[];
        };
        const add = sent.modifications?.find(
          (m) => m.type === "Add" && udfPath.test(m.udfPath),
        );
        if (sent.type === "ModifyQuerySet" && add) queryId = add.queryId;
      }
      server.send(message);
    });
    server.onMessage((message) => {
      if (failed || queryId === null || typeof message !== "string") {
        ws.send(message);
        return;
      }
      const received = JSON.parse(message) as {
        type: string;
        modifications?: { type: string; queryId: number }[];
      };
      const at =
        received.type === "Transition"
          ? (received.modifications ?? []).findIndex(
              (m) => m.type === "QueryUpdated" && m.queryId === queryId,
            )
          : -1;
      if (at < 0 || !received.modifications) {
        ws.send(message);
        return;
      }
      // No `errorData`: a timeout is a plain server error, not a ConvexError.
      received.modifications[at] = {
        type: "QueryFailed",
        queryId,
        errorMessage: "Function execution timed out (maximum duration: 1s)",
        logLines: [],
        journal: null,
      } as (typeof received.modifications)[number];
      failed = true;
      ws.send(JSON.stringify(received));
    });
  });
}

// A query that fails once (a timeout on a slow or busy backend) no longer replaces the whole app
// with the crash screen: the page says it is trying again, the help button stays, and the page
// loads on the next try. `sessions:me` is shared by the home page and the bottom bar.
test("a query that fails once retries inside the page instead of crashing the app", async ({
  page,
}) => {
  await blockExternal(page.context());
  await failFirstResult(page, /^sessions(\.js)?:me$/);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: t.retry.title }),
  ).toBeVisible();
  await expect(page.getByText(t.retry.retrying)).toBeVisible();
  await expect(page.getByRole("button", { name: t.help.open })).toBeVisible();

  await expect(
    page.getByRole("link", { name: t.home.startNewPlain }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: t.retry.title })).toBeHidden();
  await expect(
    page.getByRole("heading", { name: t.errorBoundary.title }),
  ).toHaveCount(0);
});
