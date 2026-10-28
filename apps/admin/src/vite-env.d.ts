/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex client URL of this environment's deployment. */
  readonly VITE_CONVEX_URL: string;
  /** Convex HTTP actions (.site) URL; derived from VITE_CONVEX_URL when unset. */
  readonly VITE_CONVEX_SITE_URL?: string;
  /** The website of this environment, for links to a khatma; https://wirdak.app when unset. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
