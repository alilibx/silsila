import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke test against the LOCAL anonymous Convex backend (no cloud project, no login,
 * no real WhatsApp) and the Vite dev server. `bun run e2e` starts both, runs the tests at phone
 * size in Chromium, and stops both.
 *
 * The backend keeps its state in `.convex/local` (git-ignored), shared with `bun run dev`; the tests
 * use fresh phone numbers so they never collide with earlier data. `reuseExistingServer` is
 * false: stop `bun run dev` first, or the ports are busy and the run refuses to start.
 */
const WEB_PORT = 5173; // the verification endpoint's CORS allows http://localhost:5173 only
const CONVEX_PORT = 3210;
const CONVEX_SITE_PORT = 3211;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 390, height: 844 },
    locale: "ar",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      // Local anonymous backend; ready once the functions are pushed.
      command: "bunx convex dev --tail-logs disable",
      env: { CONVEX_AGENT_MODE: "anonymous" },
      wait: { stderr: /Convex functions ready/ },
      timeout: 180_000,
      reuseExistingServer: false,
      // SIGINT lets the CLI stop convex-local-backend; a hard kill would orphan it.
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
    },
    {
      command: `bunx vite --host localhost --port ${WEB_PORT} --strictPort`,
      cwd: "apps/web",
      env: {
        VITE_CONVEX_URL: `http://127.0.0.1:${CONVEX_PORT}`,
        VITE_CONVEX_SITE_URL: `http://127.0.0.1:${CONVEX_SITE_PORT}`,
      },
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
