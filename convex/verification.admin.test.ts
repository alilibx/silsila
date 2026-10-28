import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const ADMIN_PHONE = "971500000001";
const OTHER_PHONE = "971500000002";
const CODE = "ABCDEFGH23";

const ADMIN_PIN_RE =
  /^رمز الدخول إلى لوحة إدارة وِردك: (\d{6})\nلا تعطه لأحد\. إن لم تطلبه الآن فتجاهل هذه الرسالة\.$/;

type T = TestConvexForDataModel<DataModel>;
type Sent = { to: string; body: string };
let sent: Sent[];
let msgSeq = 0;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("WIRDAK_ENV", "dev");
  vi.stubEnv("WHATSAPP_PUBLIC_NUMBER", "971500000000");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("SITE_URL", "https://wirdak.example");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as {
        to: string;
        text: { body: string };
      };
      sent.push({ to: payload.to, body: payload.text.body });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function addAdmin(t: T, phone = `+${ADMIN_PHONE}`) {
  return await t.run((ctx) =>
    ctx.db.insert("admins", { phone, addedBy: null, addedAt: NOW }),
  );
}

async function addPerson(t: T, phone: string) {
  return await t.run((ctx) =>
    ctx.db.insert("people", {
      phone,
      displayName: "سعيد",
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: 0,
    }),
  );
}

/** A pending verification with a known code; `admin` marks it as an admin panel sign-in. */
async function addPending(t: T, admin: boolean, code = CODE) {
  const secretHash = await sha256Hex("known-secret");
  return await t.run((ctx) =>
    ctx.db.insert("verifications", {
      codeNormalized: code,
      secretHash,
      displayName: admin ? "" : "علي",
      status: "pending",
      pinAttempts: 0,
      ...(admin ? { surface: "admin" as const } : {}),
      createdAt: NOW,
      expiresAt: NOW + 600_000,
    }),
  );
}

async function send(t: T, from: string, text = `رمز التحقق: ${CODE}`) {
  await t.action(internal.whatsapp.handleIncoming, {
    waMessageId: `wamid.admin.${++msgSeq}`,
    from,
    text,
  });
}

function getDoc(t: T, id: Id<"verifications">) {
  return t.run((ctx) => ctx.db.get(id));
}

function peopleCount(t: T) {
  return t.run(async (ctx) => (await ctx.db.query("people").collect()).length);
}

test("an allowlisted phone gets the admin code and no member account", async () => {
  const t = convexTest(schema, modules);
  const adminId = await addAdmin(t);
  const v = await addPending(t, true);

  await send(t, ADMIN_PHONE);

  const doc = await getDoc(t, v);
  expect(doc).toMatchObject({
    status: "needs_pin",
    phone: `+${ADMIN_PHONE}`,
    adminId,
  });
  expect(doc?.pinHash).toBeTruthy();
  expect(await peopleCount(t)).toBe(0);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.to).toBe(ADMIN_PHONE);
  expect(sent[0]?.body).toMatch(ADMIN_PIN_RE);
});

test("a phone off the allowlist gets the same reply and no adminId", async () => {
  const t = convexTest(schema, modules);
  await addAdmin(t);
  const v = await addPending(t, true);

  await send(t, OTHER_PHONE);

  const doc = await getDoc(t, v);
  expect(doc).toMatchObject({ status: "needs_pin", phone: `+${OTHER_PHONE}` });
  expect(doc?.adminId).toBeUndefined();
  expect(await peopleCount(t)).toBe(0);
  expect(sent.map((s) => s.body)).toEqual([
    expect.stringMatching(ADMIN_PIN_RE),
  ]);
});

test("a member who isn't an admin keeps their account untouched", async () => {
  const t = convexTest(schema, modules);
  const personId = await addPerson(t, `+${OTHER_PHONE}`);
  const before = await t.run((ctx) => ctx.db.get(personId));
  const v = await addPending(t, true);

  await send(t, OTHER_PHONE);

  const doc = await getDoc(t, v);
  expect(doc?.status).toBe("needs_pin");
  expect(doc?.existingPersonId).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.get(personId))).toEqual(before);
  expect(sent[0]?.body).toMatch(ADMIN_PIN_RE);
});

test("member PIN confirmation refuses an admin verification", async () => {
  const t = convexTest(schema, modules);
  await addAdmin(t);
  await addPerson(t, `+${ADMIN_PHONE}`);
  const v = await addPending(t, true);
  await send(t, ADMIN_PHONE);
  const pin = ADMIN_PIN_RE.exec(sent[0]?.body ?? "")?.[1];
  if (!pin) throw new Error("no PIN sent");

  const res = await t.mutation(internal.verification.confirmPinInternal, {
    verificationId: v,
    secretHash: await sha256Hex("known-secret"),
    tokenHash: await sha256Hex("member-token"),
    alertTokenHash: await sha256Hex("member-alert"),
    pinHash: await sha256Hex(pin),
    deviceLabel: "iPhone",
    timeZone: "Asia/Dubai",
  });

  expect(res).toEqual({ kind: "expired" });
  const sessions = await t.run((ctx) => ctx.db.query("sessions").collect());
  expect(sessions).toHaveLength(0);
});

test("a website verification still gets the member code", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t, `+${OTHER_PHONE}`);
  await addPending(t, false);

  await send(t, OTHER_PHONE);

  expect(sent[0]?.body).toMatch(/^رمز الدخول إلى وِردك: \d{6}\n/);
});

test("admin start works during maintenance; website start doesn't", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "maintenanceMode",
      value: true,
      updatedAt: 0,
    }),
  );
  const base = {
    candidates: ["ABCDEFGH23", "ABCDEFGH24", "ABCDEFGH25"],
    secretHash: await sha256Hex("s"),
    displayName: "",
    clientKey: "client-1",
    ip: "203.0.113.7",
    returnPath: "/",
  };

  const admin = await t.mutation(internal.verification.createPending, {
    ...base,
    surface: "admin",
  });
  expect("verificationId" in admin).toBe(true);
  if (!("verificationId" in admin)) return;
  expect(await getDoc(t, admin.verificationId)).toMatchObject({
    surface: "admin",
    displayName: "",
  });

  expect(
    await t.mutation(internal.verification.createPending, {
      ...base,
      candidates: ["ABCDEFGH26"],
      displayName: "علي",
    }),
  ).toEqual({ error: "maintenance" });
});

test("admin starts have their own rate limit, apart from the website's", async () => {
  const t = convexTest(schema, modules);
  const results = [];
  for (let i = 0; i < 6; i++) {
    results.push(
      await t.mutation(internal.verification.createPending, {
        candidates: [`ABCDEFGH2${"23456789"[i]}`],
        secretHash: "h",
        displayName: "",
        clientKey: "client-1",
        ip: null,
        returnPath: "/",
        surface: "admin",
      }),
    );
  }
  // 5 per client per 10 minutes.
  expect(results.slice(0, 5).every((r) => "verificationId" in r)).toBe(true);
  expect(results[5]).toEqual({ error: "rate_limited" });

  // The website's per-client bucket is untouched by those five admin starts.
  const site = await t.mutation(internal.verification.createPending, {
    candidates: ["ABCDEFGH99"],
    secretHash: "h",
    displayName: "علي",
    clientKey: "client-1",
    ip: null,
    returnPath: "/",
  });
  expect("verificationId" in site).toBe(true);
});
