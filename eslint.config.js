import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/_generated/**",
      ".claude/**",
      ".superpowers/**",
      ".convex/**",
      ".vercel/**",
      "prototypes/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
