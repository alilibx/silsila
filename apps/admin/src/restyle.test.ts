import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The panel's own code, without generated components and tests. */
function sources(
  // A string, not `new URL`: under jsdom that's jsdom's URL, which Node refuses.
  dir = dirname(fileURLToPath(import.meta.url)),
): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "ui" ? [] : sources(path);
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) {
      return [];
    }
    return [{ path, text: readFileSync(path, "utf8") }];
  });
}

const matches = (pattern: RegExp) =>
  sources().flatMap(({ path, text }) =>
    (text.match(pattern) ?? []).map((match) => `${path}: ${match}`),
  );

describe("the console theme", () => {
  it("never puts white text on a color that turns light in dark mode", () => {
    expect(matches(/\bbg-(primary|saffron)\b[^"`]*\btext-white\b/g)).toEqual(
      [],
    );
  });

  it("leaves the input box to the Input component", () => {
    // Padding from the old inputs leaves no room for text inside h-9.
    expect(
      matches(/<Input\b(?:(?!\/>)[\s\S])*?className="[^"]*\bp-3\b[^"]*"/g),
    ).toEqual([]);
  });
});
