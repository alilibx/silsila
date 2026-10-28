import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureReporterToken,
  forgetReporterToken,
  getReporterToken,
} from "./reporterToken";

beforeEach(() => {
  localStorage.clear();
  forgetReporterToken();
});

describe("reporter token", () => {
  it("is created once and then reused", () => {
    expect(getReporterToken()).toBeNull();
    const first = ensureReporterToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(ensureReporterToken()).toBe(first);
    expect(getReporterToken()).toBe(first);
  });

  it("can be forgotten", () => {
    ensureReporterToken();
    forgetReporterToken();
    expect(getReporterToken()).toBeNull();
  });
});
