import { defineConfig, devices } from "@playwright/test";
import type { Throttle } from "./e2e/throttle";

/**
 * End-to-end tests against the LOCAL anonymous Convex backend (no cloud project, no login, no
 * real WhatsApp) and a production build of the web app served by `vite preview`, so the tests
 * see the bundle people download. `bun run e2e` starts both, runs every spec on every project
 * below, and stops both. `bun run e2e --project=iphone-se` runs one.
 *
 * The projects cover the three browser engines people use (WebKit for every iPhone browser,
 * Chromium for Android and desktop Chrome, Gecko for Firefox) at phone, tablet, and desktop
 * sizes, plus a cheap Android phone on a slow mobile network. Playwright's WebKit is close to
 * Safari but not the same: safe-area insets, the on-screen keyboard, and the collapsing toolbar
 * only show on a real iPhone or the iOS Simulator.
 *
 * The backend keeps its state in `.convex/local` (git-ignored), shared with `bun run dev`; the tests
 * use fresh phone numbers so they never collide with earlier data. `reuseExistingServer` is
 * false: stop `bun run dev` first, or the ports are busy and the run refuses to start.
 */
const WEB_PORT = 5173; // the verification endpoint's CORS allows http://localhost:5173 only
const CONVEX_PORT = 3210;
const CONVEX_SITE_PORT = 3211;

/** A cheap phone on a weak mobile connection: Lighthouse's mobile profile (1.6 Mbps, 150 ms, 4× CPU). */
const SLOW_MOBILE: Throttle = {
  downloadKbps: 1_600,
  uploadKbps: 750,
  latencyMs: 150,
  cpuSlowdown: 4,
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  // Every test uses its own fresh numbers and khatmas, so tests can share the one backend.
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "ar",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Phones. Every iPhone browser is WebKit; Android phones run Chromium.
    { name: "iphone-se", use: { ...devices["iPhone SE (3rd gen)"] } },
    { name: "iphone-pro-max", use: { ...devices["iPhone 15 Pro Max"] } },
    { name: "android-small", use: { ...devices["Moto G4"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
    // Tablet and desktop, one per engine.
    { name: "ipad", use: { ...devices["iPad Mini"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-safari", use: { ...devices["Desktop Safari"] } },
    // A cheap Android phone on a slow network. Throttling needs Chromium's DevTools protocol.
    {
      name: "slow-android",
      use: { ...devices["Moto G4"] },
      metadata: { throttle: SLOW_MOBILE },
      timeout: 300_000,
      expect: { timeout: 30_000 },
    },
  ],
  webServer: [
    {
      // Local anonymous backend; ready once the functions are pushed.
      command: "bun run convex dev --tail-logs disable",
      env: { CONVEX_AGENT_MODE: "anonymous" },
      wait: { stderr: /Convex functions ready/ },
      timeout: 180_000,
      reuseExistingServer: false,
      // SIGINT lets the CLI stop convex-local-backend; a hard kill would orphan it.
      gracefulShutdown: { signal: "SIGINT", timeout: 15_000 },
    },
    {
      // The production build, pointed at the local backend. `vite build` without `tsc`:
      // `bun run typecheck` covers types.
      command: `bun run vite build && bun run vite preview --host localhost --port ${WEB_PORT} --strictPort`,
      cwd: "apps/web",
      env: {
        VITE_CONVEX_URL: `http://127.0.0.1:${CONVEX_PORT}`,
        VITE_CONVEX_SITE_URL: `http://127.0.0.1:${CONVEX_SITE_PORT}`,
      },
      url: `http://localhost:${WEB_PORT}`,
      timeout: 180_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
