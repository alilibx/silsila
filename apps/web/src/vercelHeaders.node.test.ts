import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("website headers", () => {
  it("allow the microphone on this site only, for help voice notes", () => {
    const config = JSON.parse(
      readFileSync(join(__dirname, "..", "vercel.json"), "utf8"),
    ) as { headers: { headers: { key: string; value: string }[] }[] };
    const policy = config.headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === "Permissions-Policy")?.value;
    expect(policy).toBe("camera=(), microphone=(self), geolocation=()");
  });
});
