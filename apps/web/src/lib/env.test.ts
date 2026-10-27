import { afterEach, describe, expect, it, vi } from "vitest";
import { convexSiteUrl, deriveConvexSiteUrl } from "./env";

describe("deriveConvexSiteUrl", () => {
  it("uses VITE_CONVEX_SITE_URL when it is set", () => {
    expect(
      deriveConvexSiteUrl("http://127.0.0.1:3210", "http://127.0.0.1:3211"),
    ).toBe("http://127.0.0.1:3211");
  });

  it("derives the .convex.site URL from a .convex.cloud one when it is not", () => {
    expect(
      deriveConvexSiteUrl("https://happy-otter-123.convex.cloud", undefined),
    ).toBe("https://happy-otter-123.convex.site");
    expect(
      deriveConvexSiteUrl(
        "https://happy-otter-123.eu-west-1.convex.cloud/",
        "",
      ),
    ).toBe("https://happy-otter-123.eu-west-1.convex.site");
  });

  it("only replaces a trailing .convex.cloud", () => {
    expect(
      deriveConvexSiteUrl("https://x.convex.cloud.example.com", undefined),
    ).toBe("");
    expect(deriveConvexSiteUrl("http://127.0.0.1:3210", undefined)).toBe("");
    expect(deriveConvexSiteUrl(undefined, undefined)).toBe("");
  });

  it("drops a trailing slash from an explicit site URL", () => {
    expect(deriveConvexSiteUrl(undefined, "https://a.convex.site/")).toBe(
      "https://a.convex.site",
    );
  });
});

describe("convexSiteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads the build's environment", () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://quiet-fox-9.convex.cloud");
    vi.stubEnv("VITE_CONVEX_SITE_URL", "");
    expect(convexSiteUrl()).toBe("https://quiet-fox-9.convex.site");
  });
});
