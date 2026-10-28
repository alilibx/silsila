/// <reference types="vite/client" />

/** The release this build ships, from the root package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Convex client URL, e.g. http://127.0.0.1:3210 */
  readonly VITE_CONVEX_URL: string;
  /**
   * Convex HTTP actions (.site) URL, e.g. http://127.0.0.1:3211. Optional for hosted
   * deployments: it is derived from a `.convex.cloud` VITE_CONVEX_URL (see src/lib/env.ts).
   */
  readonly VITE_CONVEX_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
