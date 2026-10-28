import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..");

describe("index.html", () => {
  // WebKit keeps the first manifest a page links, so a static one here would win over the
  // hand-off manifest and every home-screen app would open signed out (see linkPageManifest).
  it("links no manifest", () => {
    const html = readFileSync(join(WEB, "index.html"), "utf8");
    expect(html).not.toMatch(/rel=["']?manifest/i);
  });
});
