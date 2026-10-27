import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@convex": decodeURIComponent(
        new URL("../../convex", import.meta.url).pathname,
      ),
    },
  },
});
