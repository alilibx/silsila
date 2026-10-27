import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const DIRS = ["components", "pages"];
const PHYSICAL = /\b(ml|mr|pl|pr|left|right)-|text-left|text-right/;

function sources(): string[] {
  return DIRS.flatMap((d) =>
    readdirSync(join(SRC, d))
      .filter((f) => /\.tsx$/.test(f) && !f.endsWith(".test.tsx"))
      .map((f) => join(SRC, d, f)),
  );
}

describe("layout", () => {
  it("no left/right classes in components", () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(PHYSICAL);
    }
  });

  it("no Arabic literals in components or pages", () => {
    for (const file of sources()) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/[؀-ۿ]/);
    }
  });
});
