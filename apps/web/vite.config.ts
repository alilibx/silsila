import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

/** Serves /privacy from public/privacy.html, as the vercel.json rewrite does in production. */
function privacyPage(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url?.split("?")[0] === "/privacy") req.url = "/privacy.html";
    next();
  };
  return {
    name: "privacy-page",
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

/** The release, from the root package.json that release-please bumps (apps/web stays 0.0.0). */
const appVersion = (
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../package.json", import.meta.url)),
      "utf8",
    ),
  ) as { version: string }
).version;

export default defineConfig({
  plugins: [react(), tailwindcss(), privacyPage()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
    },
  },
});
