import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { getSetting } from "./lib/settings";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
});

const ipLimit = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => getSetting(ctx, "verifyStartPerIpPer10Min"));

test("dev:setSetting refuses outside dev and writes nothing", async () => {
  const t = convexTest(schema, modules);
  for (const env of ["prod", ""]) {
    vi.stubEnv("WIRDAK_ENV", env);
    await expect(
      t.mutation(internal.dev.setSetting, {
        key: "verifyStartPerIpPer10Min",
        value: 1000,
      }),
    ).rejects.toThrow(/only when WIRDAK_ENV is dev/);
  }
  expect(await t.run((ctx) => ctx.db.query("settings").collect())).toEqual([]);
});

test("dev:setSetting stores a number, replaces it, and removes it with null", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("WIRDAK_ENV", "dev");
  const set = (value: number | null) =>
    t.mutation(internal.dev.setSetting, {
      key: "verifyStartPerIpPer10Min",
      value,
    });

  expect(await set(1000)).toBeNull();
  expect(await ipLimit(t)).toBe(1000);
  expect(await set(2000)).toBe(1000);
  expect(await ipLimit(t)).toBe(2000);
  expect(await t.run((ctx) => ctx.db.query("settings").collect())).toHaveLength(
    1,
  );
  expect(await set(null)).toBe(2000);
  expect(await ipLimit(t)).toBe(30);
  expect(await t.run((ctx) => ctx.db.query("settings").collect())).toEqual([]);
});

test("dev:setSetting refuses unknown and non-numeric settings", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("WIRDAK_ENV", "dev");
  await expect(
    t.mutation(internal.dev.setSetting, { key: "noSuchSetting", value: 1 }),
  ).rejects.toThrow(/unknown setting/);
  await expect(
    t.mutation(internal.dev.setSetting, { key: "toString", value: 1 }),
  ).rejects.toThrow(/unknown setting/);
  await expect(
    t.mutation(internal.dev.setSetting, { key: "graceDefaults", value: 1 }),
  ).rejects.toThrow(/not a numeric setting/);
});
