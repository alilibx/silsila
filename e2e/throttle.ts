/**
 * A network and CPU slowdown for a project, set in its `metadata.throttle` (Chromium only).
 * Its own file so playwright.config.ts can use it without loading the app's code.
 */
export type Throttle = {
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
  /** 4 means the CPU runs four times slower. */
  cpuSlowdown: number;
};
