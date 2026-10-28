import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "../schema";
import { bumpCounter, dayStart, dubaiDay, readCounter } from "./stats";

const modules = import.meta.glob("../**/*.ts");

test("a Dubai day starts at 20:00 UTC", () => {
  const before = Date.parse("2026-10-29T19:59:59Z");
  const after = Date.parse("2026-10-29T20:00:00Z");
  expect(dubaiDay(after)).toBe(dubaiDay(before) + 1);
  expect(dayStart(dubaiDay(after))).toBe(after);
  expect(dayStart(dubaiDay(before))).toBeLessThanOrEqual(before);
});

test("counters add up and read zero when missing", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    expect(await readCounter(ctx, "x")).toBe(0);
    await bumpCounter(ctx, "x");
    await bumpCounter(ctx, "x", 2);
    expect(await readCounter(ctx, "x")).toBe(3);
  });
});
