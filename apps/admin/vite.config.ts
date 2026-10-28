import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
      // The website's components and theme, shared rather than copied (spec 4.1).
      "@web": fileURLToPath(new URL("../web/src", import.meta.url)),
    },
  },
  // Matches the dev fallback of adminSiteUrl() in convex/whatsapp.ts.
  server: { port: 5174, strictPort: true },
});
