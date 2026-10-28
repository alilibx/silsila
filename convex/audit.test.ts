import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { ADMIN_SESSION_TTL_MS } from "./lib/adminSession";
import type { AuditAction } from "./lib/audit";
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

async function signedInAdmin(t: T, phone: string, token: string) {
  const adminId = await t.run((ctx) =>
    ctx.db.insert("admins", { phone, addedBy: null, addedAt: NOW }),
  );
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

function addRow(
  t: T,
  adminId: Id<"admins"> | null,
  action: AuditAction,
  at: number,
) {
  return t.run((ctx) =>
    ctx.db.insert("auditLog", {
      adminId,
      action,
      targetKind: action.startsWith("setting") ? "setting" : "admin",
      targetId: "x",
      before: null,
      after: null,
      note: null,
      at,
    }),
  );
}

const page = { numItems: 10, cursor: null };

test("lists newest first, with each admin's phone", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedInAdmin(t, "+971500000001", "ali");
  await addRow(t, null, "admin.bootstrap", NOW - 3000);
  await addRow(t, ali, "setting.set", NOW - 2000);
  await addRow(t, ali, "admin.add", NOW - 1000);

  const res = await t.query(api.audit.list, {
    adminToken: "ali",
    paginationOpts: page,
  });
  expect(res.page.map((r) => [r.action, r.adminPhone])).toEqual([
    ["admin.add", "+971500000001"],
    ["setting.set", "+971500000001"],
    ["admin.bootstrap", null],
  ]);
});

test("filters by admin or by action, not both", async () => {
  const t = convexTest(schema, modules);
  const ali = await signedInAdmin(t, "+971500000001", "ali");
  const sara = await signedInAdmin(t, "+971500000002", "sara");
  await addRow(t, ali, "setting.set", NOW - 3000);
  await addRow(t, sara, "setting.reset", NOW - 2000);
  await addRow(t, sara, "setting.set", NOW - 1000);

  const bySara = await t.query(api.audit.list, {
    adminToken: "ali",
    paginationOpts: page,
    adminId: sara,
  });
  expect(bySara.page.map((r) => r.action)).toEqual([
    "setting.set",
    "setting.reset",
  ]);

  const sets = await t.query(api.audit.list, {
    adminToken: "ali",
    paginationOpts: page,
    action: "setting.set",
  });
  expect(sets.page.map((r) => r.adminPhone)).toEqual([
    "+971500000002",
    "+971500000001",
  ]);

  await expect(
    t.query(api.audit.list, {
      adminToken: "ali",
      paginationOpts: page,
      adminId: sara,
      action: "setting.set",
    }),
  ).rejects.toThrow(/one_filter/);
});

test("only admins can read the log", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.audit.list, { adminToken: "nobody", paginationOpts: page }),
  ).rejects.toThrow(/not_admin/);
});
