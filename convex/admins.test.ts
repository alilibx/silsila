import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { normalizeAdminPhone } from "./admins";
import { ADMIN_SESSION_TTL_MS } from "./lib/adminSession";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

/** Bootstraps an admin and signs them in with `token`. */
async function signedInAdmin(t: T, phone: string, token: string) {
  const existing = await t.run((ctx) =>
    ctx.db
      .query("admins")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .first(),
  );
  const adminId =
    existing?._id ??
    (await t.run((ctx) =>
      ctx.db.insert("admins", { phone, addedBy: null, addedAt: NOW }),
    ));
  const tokenHash = await sha256Hex(token);
  await t.run((ctx) =>
    ctx.db.insert("adminSessions", {
      adminId,
      tokenHash,
      alertTokenHash: tokenHash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      expiresAt: NOW + ADMIN_SESSION_TTL_MS,
    }),
  );
  return adminId;
}

async function auditRows(t: T) {
  return await t.run((ctx) => ctx.db.query("auditLog").collect());
}

test("bootstrap adds the first admin once", async () => {
  const t = convexTest(schema, modules);
  const { adminId } = await t.mutation(internal.admins.bootstrap, {
    phone: "+971501234567",
  });
  const admin = await t.run((ctx) => ctx.db.get(adminId));
  expect(admin).toMatchObject({ phone: "+971501234567", addedBy: null });
  expect(await auditRows(t)).toMatchObject([
    {
      adminId: null,
      action: "admin.bootstrap",
      after: { phone: "+971501234567" },
    },
  ]);
  await expect(
    t.mutation(internal.admins.bootstrap, { phone: "+971509999999" }),
  ).rejects.toThrow(/already_bootstrapped/);
});

test("normalizeAdminPhone accepts international numbers in common shapes", () => {
  expect(normalizeAdminPhone("+971 50 123 4567")).toBe("+971501234567");
  expect(normalizeAdminPhone("00971501234567")).toBe("+971501234567");
  expect(normalizeAdminPhone("+٩٧١٥٠١٢٣٤٥٦٧")).toBe("+971501234567");
  expect(normalizeAdminPhone("+971-50-123-4567")).toBe("+971501234567");
  expect(normalizeAdminPhone("0501234567")).toBeNull();
  expect(normalizeAdminPhone("+12")).toBeNull();
});

test("add refuses invalid and duplicate numbers and records who added", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedInAdmin(t, "+971500000001", "ali");
  await expect(
    t.mutation(api.admins.add, { adminToken: "ali", phone: "0501234567" }),
  ).resolves.toEqual({ error: "invalid_phone" });
  await expect(
    t.mutation(api.admins.add, { adminToken: "ali", phone: "+971500000001" }),
  ).resolves.toEqual({ error: "already_admin" });

  const res = await t.mutation(api.admins.add, {
    adminToken: "ali",
    phone: "+971 50 000 0002",
  });
  if (!("adminId" in res)) throw new Error("expected an adminId");
  const added = await t.run((ctx) => ctx.db.get(res.adminId));
  expect(added).toMatchObject({ phone: "+971500000002", addedBy: ali });
  expect(await auditRows(t)).toMatchObject([
    {
      adminId: ali,
      action: "admin.add",
      targetKind: "admin",
      targetId: res.adminId,
      after: { phone: "+971500000002" },
    },
  ]);
});

test("the last admin can't be removed", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedInAdmin(t, "+971500000001", "ali");
  await expect(
    t.mutation(api.admins.remove, { adminToken: "ali", adminId: ali }),
  ).resolves.toEqual({ error: "last_admin" });
  expect(await auditRows(t)).toHaveLength(0);
});

test("removing an admin ends their sessions at once", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedInAdmin(t, "+971500000001", "ali");
  const sara = await signedInAdmin(t, "+971500000002", "sara");
  await t.query(api.admins.list, { adminToken: "sara" });

  await t.mutation(api.admins.remove, {
    adminToken: "ali",
    adminId: sara,
    note: "left the team",
  });
  await expect(
    t.query(api.admins.list, { adminToken: "sara" }),
  ).rejects.toThrow(/not_admin/);
  const sessions = await t.run((ctx) =>
    ctx.db
      .query("adminSessions")
      .withIndex("by_admin", (q) => q.eq("adminId", sara))
      .collect(),
  );
  expect(sessions).toHaveLength(0);
  expect(await auditRows(t)).toMatchObject([
    {
      adminId: ali,
      action: "admin.remove",
      targetId: sara,
      before: { phone: "+971500000002" },
      note: "left the team",
    },
  ]);
});

test("list shows every admin oldest first and marks the caller", async () => {
  const t = convexTest(schema, modules);
  await signedInAdmin(t, "+971500000001", "ali");
  vi.setSystemTime(NOW + 1000);
  const sara: Id<"admins"> = await t.run((ctx) =>
    ctx.db.insert("admins", {
      phone: "+971500000002",
      addedBy: null,
      addedAt: NOW + 1000,
    }),
  );
  const rows = await t.query(api.admins.list, { adminToken: "ali" });
  expect(rows.map((r) => [r.phone, r.isMe])).toEqual([
    ["+971500000001", true],
    ["+971500000002", false],
  ]);
  expect(rows[1]?.adminId).toBe(sara);
});

test("a member session token can't list admins", async () => {
  const t = convexTest(schema, modules);
  await signedInAdmin(t, "+971500000001", "ali");
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "+971500000009",
      displayName: "س",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
  const hash = await sha256Hex("member");
  await t.run((ctx) =>
    ctx.db.insert("sessions", {
      personId,
      tokenHash: hash,
      alertTokenHash: hash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      lastUsedAt: NOW,
    }),
  );
  await expect(
    t.query(api.admins.list, { adminToken: "member" }),
  ).rejects.toThrow(/not_admin/);
});
