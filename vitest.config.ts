import { defineConfig } from "vitest/config";

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
        test: {
          name: "web",
          environment: "jsdom",
          include: ["apps/web/**/*.test.{ts,tsx}"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
