import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  ADMIN_SESSION_TTL_MS,
  deleteAdminSessions,
  resolveAdminSession,
} from "./adminSession";
import { writeAudit } from "./audit";
import { sha256Hex } from "./crypto";

const modules = import.meta.glob("../**/*.ts");

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type T = TestConvexForDataModel<DataModel>;

async function addAdmin(t: T, phone = "+971500000001") {
  return await t.run((ctx) =>
    ctx.db.insert("admins", { phone, addedBy: null, addedAt: NOW }),
  );
}

async function addAdminSession(
  t: T,
  adminId: Id<"admins">,
  token: string,
  createdAt = NOW,
) {
  const tokenHash = await sha256Hex(token);
  const alertTokenHash = await sha256Hex(`${token}-alert`);
  return await t.run((ctx) =>
    ctx.db.insert("adminSessions", {
      adminId,
      tokenHash,
      alertTokenHash,
      deviceLabel: "iPhone",
      createdAt,
      expiresAt: createdAt + ADMIN_SESSION_TTL_MS,
    }),
  );
}

test("a valid admin token resolves to its admin", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  await addAdminSession(t, adminId, "tok");
  const resolved = await t.run((ctx) => resolveAdminSession(ctx, "tok"));
  expect(resolved?.admin._id).toBe(adminId);
});

test("no token, an unknown token, and a member token resolve to null", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  await addAdminSession(t, adminId, "tok");
  const personId = await t.run((ctx) =>
    ctx.db.insert("people", {
      phone: "+971500000002",
      displayName: "علي",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
  const memberHash = await sha256Hex("member-tok");
  await t.run((ctx) =>
    ctx.db.insert("sessions", {
      personId,
      tokenHash: memberHash,
      alertTokenHash: memberHash,
      deviceLabel: "iPhone",
      createdAt: NOW,
      lastUsedAt: NOW,
    }),
  );
  await t.run(async (ctx) => {
    expect(await resolveAdminSession(ctx, undefined)).toBeNull();
    expect(await resolveAdminSession(ctx, "nope")).toBeNull();
    expect(await resolveAdminSession(ctx, "member-tok")).toBeNull();
  });
});

test("a session ends exactly 12 hours after it was created", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  await addAdminSession(t, adminId, "tok");
  vi.setSystemTime(NOW + ADMIN_SESSION_TTL_MS - 1);
  expect(await t.run((ctx) => resolveAdminSession(ctx, "tok"))).not.toBeNull();
  vi.setSystemTime(NOW + ADMIN_SESSION_TTL_MS);
  expect(await t.run((ctx) => resolveAdminSession(ctx, "tok"))).toBeNull();
  expect(ADMIN_SESSION_TTL_MS).toBe(12 * 3_600_000);
});

test("a token whose admin was deleted resolves to null", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  await addAdminSession(t, adminId, "tok");
  await t.run((ctx) => ctx.db.delete(adminId));
  expect(await t.run((ctx) => resolveAdminSession(ctx, "tok"))).toBeNull();
});

test("deleteAdminSessions deletes only that admin's sessions", async () => {
  const t = convexTest(schema, modules);
  const a = await addAdmin(t, "+971500000001");
  const b = await addAdmin(t, "+971500000002");
  await addAdminSession(t, a, "a1");
  await addAdminSession(t, a, "a2");
  await addAdminSession(t, b, "b1");
  const deleted = await t.run((ctx) => deleteAdminSessions(ctx, a));
  expect(deleted).toBe(2);
  await t.run(async (ctx) => {
    expect(await resolveAdminSession(ctx, "a1")).toBeNull();
    expect(await resolveAdminSession(ctx, "b1")).not.toBeNull();
  });
});

test("writeAudit records the entry with the current time and a null note", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  await t.run((ctx) =>
    writeAudit(ctx, {
      actor: {
        _id: adminId,
        _creationTime: 0,
        phone: "+971500000001",
        addedBy: null,
        addedAt: NOW,
      },
      action: "setting.set",
      targetKind: "setting",
      targetId: "maxMembers",
      before: 60,
      after: 40,
    }),
  );
  const rows = await t.run((ctx) => ctx.db.query("auditLog").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    adminId,
    adminPhone: "+971500000001",
    action: "setting.set",
    targetKind: "setting",
    targetId: "maxMembers",
    before: 60,
    after: 40,
    note: null,
    at: NOW,
  });
});
