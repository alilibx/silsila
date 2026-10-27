/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Convex client URL, e.g. http://127.0.0.1:3210 */
  readonly VITE_CONVEX_URL: string;
  /** Convex HTTP actions (.site) URL, e.g. http://127.0.0.1:3211 */
  readonly VITE_CONVEX_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
