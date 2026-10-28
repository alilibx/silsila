import { convexTest } from "convex-test";
import { expect, expectTypeOf, test } from "vitest";
import schema from "../schema";
import { getSetting, SETTING_DEFAULTS } from "./settings";

const modules = import.meta.glob("../**/*.ts");

test("falls back to defaults", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    expect(await getSetting(ctx, "maxMembers")).toBe(60);
    expect(await getSetting(ctx, "rotationLookbackRounds")).toBe(3);
    expect(await getSetting(ctx, "undoWindowMs")).toBe(10_000);
    expect(await getSetting(ctx, "maintenanceMode")).toBe(false);
    expect(await getSetting(ctx, "announcement")).toBeNull();
  });
});

test("stored value wins", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("settings", {
      key: "maxMembers",
      value: 40,
      updatedAt: 0,
    });
    expect(await getSetting(ctx, "maxMembers")).toBe(40);
    await ctx.db.insert("settings", {
      key: "announcement",
      value: "hello",
      updatedAt: 0,
    });
    expect(await getSetting(ctx, "announcement")).toBe("hello");
    // unrelated keys still default
    expect(await getSetting(ctx, "undoWindowMs")).toBe(10_000);
  });
});

test("defaults match the spec", () => {
  expect(SETTING_DEFAULTS).toEqual({
    maxMembers: 60,
    rotationLookbackRounds: 3,
    undoWindowMs: 10_000,
    completionDelayMs: 10_000,
    verificationTtlMs: 600_000,
    pinMaxAttempts: 5,
    verifyStartPerClientPer10Min: 5,
    verifyStartPerIpPer10Min: 30,
    verifyPerPhonePerHour: 10,
    verifyGlobalPerMinute: 120,
    poolActionsPerPersonPerMinute: 10,
    createsPerPersonPerDay: 5,
    newMembersPerKhatmaPerHour: 30,
    nameChangesPerPersonPerHour: 10,
    maintenanceMode: false,
    announcement: null,
  });
});

test("getSetting return types are widened per key", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    expectTypeOf(await getSetting(ctx, "maxMembers")).toEqualTypeOf<number>();
    expectTypeOf(
      await getSetting(ctx, "maintenanceMode"),
    ).toEqualTypeOf<boolean>();
    expectTypeOf(await getSetting(ctx, "announcement")).toEqualTypeOf<
      string | null
    >();
  });
});

test("duplicate key rows do not break getSetting", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("settings", {
      key: "maxMembers",
      value: 40,
      updatedAt: 0,
    });
    await ctx.db.insert("settings", {
      key: "maxMembers",
      value: 50,
      updatedAt: 1,
    });
    expect([40, 50]).toContain(await getSetting(ctx, "maxMembers"));
  });
});
