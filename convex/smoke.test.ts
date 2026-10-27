import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

test("convex-test boots with the schema", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  expect(t).toBeDefined();
});
