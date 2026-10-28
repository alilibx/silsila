import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appVersion = (
  JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  ) as {
    version: string;
  }
).version;

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
        },
      },
      {
        define: { __APP_VERSION__: JSON.stringify(appVersion) },
        resolve: {
          alias: {
            "@convex": fileURLToPath(new URL("./convex", import.meta.url)),
          },
        },
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/**/*.test.{ts,tsx}"],
          setupFiles: ["apps/web/src/test/setup.ts"],
        },
      },
    ],
  },
});
