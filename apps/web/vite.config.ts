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

export default defineConfig({
  plugins: [react(), tailwindcss(), privacyPage()],
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
    },
  },
});
