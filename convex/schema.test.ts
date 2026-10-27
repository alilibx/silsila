import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("khatma schedule is validated against SCHEDULES", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const creatorPersonId = await ctx.db.insert("people", {
      phone: "+966500000000",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
    });
    const base = {
      name: null,
      creatorPersonId,
      inviteCode: "abc",
      completedRounds: 0,
      createdAt: 0,
    };
    await expect(
      ctx.db.insert("khatmas", { ...base, schedule: "daily" }),
    ).resolves.toBeTruthy();
    await expect(
      ctx.db.insert("khatmas", {
        ...base,
        // @ts-expect-error "yearly" is never offered
        schedule: "yearly",
      }),
    ).rejects.toThrow();
  });
});

test("people can be read back by phone index", async () => {
  const t = convexTest(schema, modules);
  const id: Id<"people"> = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "+966500000001",
      displayName: "x",
      verifiedAt: 0,
      timeZone: "UTC",
    }),
  );
  const found = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_phone", (q) => q.eq("phone", "+966500000001"))
      .first(),
  );
  expect(found?._id).toBe(id);
});
