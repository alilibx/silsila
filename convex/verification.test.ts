import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const TEN_MIN = 600_000;
const PHONE = "971501234567";
const E164 = `+${PHONE}`;
const SITE = "https://silsila.example";

const NO_MATCH =
  "لم نجد رمز تحقق صالحاً. ارجع إلى سلسلة واضغط «تحقّق عبر واتساب» ثم أرسل الرسالة الجاهزة كما هي.";
const MATCHED = "تمّ التحقق ✅ ارجع إلى سلسلة لتكمل.";
const PIN_RE = /^رمز الدخول إلى سلسلة: (\d{6})\nلا تشاركه مع أحد\.$/;

type T = TestConvexForDataModel<DataModel>;
type Sent = { to: string; body: string };
let sent: Sent[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SILSILA_ENV", "dev");
  vi.stubEnv("WHATSAPP_PUBLIC_NUMBER", "971500000000");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_APP_SECRET", "test-app-secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("SITE_URL", SITE);
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

let msgSeq = 0;

type Started = {
  verificationId: Id<"verifications">;
  secret: string;
  code: string;
  waNumber: string;
  message: string;
};

async function start(
  t: T,
  displayName = "علي",
  clientKey = "client-1",
): Promise<Started> {
  const res = await t.action(internal.verification.startInternal, {
    displayName,
    clientKey,
    ip: "203.0.113.7",
  });
  if ("error" in res) throw new Error(res.error);
  return res;
}

async function send(
  t: T,
  text: string,
  from = PHONE,
  waMessageId = `wamid.${++msgSeq}`,
) {
  await t.action(internal.whatsapp.handleIncoming, {
    waMessageId,
    from,
    text,
  });
}

function status(t: T, v: Started) {
  return t.query(api.verification.status, {
    verificationId: v.verificationId,
    secret: v.secret,
  });
}

function claim(t: T, v: Started, deviceLabel = "iPhone Safari") {
  return t.action(api.verification.claim, {
    verificationId: v.verificationId,
    secret: v.secret,
    deviceLabel,
    timeZone: "Asia/Dubai",
  });
}

function confirmPin(t: T, v: Started, pin: string) {
  return t.action(api.verification.confirmPin, {
    verificationId: v.verificationId,
    secret: v.secret,
    pin,
    deviceLabel: "Android Chrome",
    timeZone: "Asia/Dubai",
  });
}

async function addPerson(t: T, phone = E164, displayName = "سعيد") {
  return await t.run((ctx) =>
    ctx.db.insert("people", {
      phone,
      displayName,
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
    }),
  );
}

/** Inserts a pending verification with a known code. */
async function addPending(t: T, code: string, secret = "known-secret") {
  const secretHash = await sha256Hex(secret);
  const verificationId = await t.run((ctx) =>
    ctx.db.insert("verifications", {
      codeNormalized: code,
      secretHash,
      displayName: "علي",
      status: "pending",
      pinAttempts: 0,
      createdAt: NOW,
      expiresAt: NOW + TEN_MIN,
    }),
  );
  return {
    verificationId,
    secret,
    code,
    waNumber: "",
    message: "",
  } satisfies Started;
}

const sessionCount = (t: T) =>
  t.run(async (ctx) => (await ctx.db.query("sessions").collect()).length);

function pinsSent(to = PHONE) {
  return sent
    .filter((s) => s.to === to)
    .map((s) => PIN_RE.exec(s.body)?.[1])
    .filter((p): p is string => p !== undefined);
}

function otherPin(pin: string) {
  return String((Number(pin) + 1) % 1_000_000).padStart(6, "0");
}

test("start over HTTP returns a formatted code and the ready-made message", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/api/verification/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE },
    body: JSON.stringify({ displayName: "  علي  ", clientKey: "c1" }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(SITE);
  const body = (await res.json()) as Started;
  expect(body.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
  expect(body.code).not.toMatch(/[IO01]/);
  expect(body.message).toBe(`رمز التحقق في سلسلة: ${body.code}`);
  expect(body.waNumber).toBe("971500000000");
  expect(body.secret.length).toBeGreaterThanOrEqual(40);

  const row = await t.run((ctx) => ctx.db.get(body.verificationId));
  expect(row).toMatchObject({
    codeNormalized: body.code.replace(/-/g, ""),
    displayName: "علي",
    status: "pending",
    pinAttempts: 0,
    createdAt: NOW,
    expiresAt: NOW + TEN_MIN,
  });
  // only the hash of the secret is stored
  expect(row!.secretHash).toBe(await sha256Hex(body.secret));
  expect(JSON.stringify(row)).not.toContain(body.secret);
  expect(await status(t, body)).toEqual({
    status: "pending",
    maskedPhone: null,
  });
});

test("start over HTTP: CORS preflight, origins, and error codes", async () => {
  const t = convexTest(schema, modules);
  const pre = await t.fetch("/api/verification/start", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
    },
  });
  expect(pre.status).toBe(204);
  expect(pre.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:5173",
  );
  expect(pre.headers.get("Access-Control-Allow-Methods")).toContain("POST");

  const evilPre = await t.fetch("/api/verification/start", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" },
  });
  expect(evilPre.headers.get("Access-Control-Allow-Origin")).toBeNull();
  const evil = await t.fetch("/api/verification/start", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
    body: JSON.stringify({ displayName: "علي", clientKey: "c1" }),
  });
  expect(evil.status).toBe(403);
  expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();

  const post = (body: unknown) =>
    t.fetch("/api/verification/start", {
      method: "POST",
      headers: { Origin: SITE },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  const blank = await post({ displayName: "   ", clientKey: "c1" });
  expect(blank.status).toBe(400);
  expect(await blank.json()).toEqual({ error: "invalid_name" });

  const garbage = await post("{not json");
  expect(garbage.status).toBe(400);
  const wrongTypes = await post({ displayName: 1, clientKey: "c1" });
  expect(wrongTypes.status).toBe(400);

  for (let i = 0; i < 5; i++) {
    expect((await post({ displayName: "علي", clientKey: "c2" })).status).toBe(
      200,
    );
  }
  const limited = await post({ displayName: "علي", clientKey: "c2" });
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({ error: "rate_limited" });
  expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(SITE);

  await t.run((ctx) =>
    ctx.db.insert("settings", {
      key: "maintenanceMode",
      value: true,
      updatedAt: NOW,
    }),
  );
  const maint = await post({ displayName: "علي", clientKey: "c3" });
  expect(maint.status).toBe(503);
  expect(await maint.json()).toEqual({ error: "maintenance" });
});

test("startInternal rate-limits per client and per IP", async () => {
  const t = convexTest(schema, modules);
  const go = (clientKey: string, ip: string | null) =>
    t.action(internal.verification.startInternal, {
      displayName: "علي",
      clientKey,
      ip,
    });
  for (let i = 0; i < 5; i++) {
    expect(await go(`k${i}`, "198.51.100.1")).not.toHaveProperty("error");
  }
  // a fresh client key from the same IP is still limited
  expect(await go("k-new", "198.51.100.1")).toEqual({ error: "rate_limited" });
  // another IP is fine
  expect(await go("k-new", "198.51.100.2")).not.toHaveProperty("error");
  // no IP: only the client key counts
  expect(await go("k-other", null)).not.toHaveProperty("error");
  // the window resets after 10 minutes
  vi.setSystemTime(NOW + TEN_MIN);
  expect(await go("k-new2", "198.51.100.1")).not.toHaveProperty("error");
});

test("new number: start → message → matched → claim → session", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t, "أم أحمد");
  await send(t, v.message);

  expect(await status(t, v)).toEqual({
    status: "matched",
    maskedPhone: "+971 50 ••• 4567",
  });
  expect(sent).toEqual([{ to: PHONE, body: MATCHED }]);
  const row = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(row?.phone).toBe(E164);

  const res = await claim(t, v);
  if (!("sessionToken" in res)) throw new Error(JSON.stringify(res));
  expect(
    await t.query(api.sessions.me, { sessionToken: res.sessionToken }),
  ).toEqual({
    displayName: "أم أحمد",
    maskedPhone: "+971 50 ••• 4567",
  });
  const person = await t.run((ctx) =>
    ctx.db
      .query("people")
      .withIndex("by_phone", (q) => q.eq("phone", E164))
      .unique(),
  );
  expect(person).toMatchObject({
    phone: E164,
    displayName: "أم أحمد",
    timeZone: "Asia/Dubai",
  });
  // convex-test advances its transaction clock by a millisecond per transaction
  expect(person!.verifiedAt - NOW).toBeLessThan(1000);
  expect((await status(t, v)).status).toBe("claimed");

  // the sign-in alert carries a working sign-out link
  const alert = sent.at(-1)!;
  expect(alert.to).toBe(PHONE);
  const m =
    /^تمّ إنشاء حساب في سلسلة برقمك من iPhone Safari\. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من كل الأجهزة: https:\/\/silsila\.example\/signout\?t=([A-Za-z0-9_-]{43})$/.exec(
      alert.body,
    );
  expect(m).not.toBeNull();
  const session = await t.run((ctx) => ctx.db.query("sessions").unique());
  expect(session?.alertTokenHash).toBe(await sha256Hex(m![1]!));
  expect(session?.tokenHash).toBe(await sha256Hex(res.sessionToken));
  expect(session?.deviceLabel).toBe("iPhone Safari");

  // claiming twice yields no second session
  expect(await claim(t, v)).toEqual({ error: "expired" });
  expect(await sessionCount(t)).toBe(1);
});

test("existing number needs the PIN from the WhatsApp reply", async () => {
  const t = convexTest(schema, modules);
  const personId = await addPerson(t);
  const v = await start(t);
  await send(t, v.message);

  expect(await status(t, v)).toEqual({
    status: "needs_pin",
    maskedPhone: "+971 50 ••• 4567",
  });
  const pins = pinsSent();
  expect(pins).toHaveLength(1);
  const pin = pins[0]!;
  const row = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(row).toMatchObject({
    status: "needs_pin",
    phone: E164,
    existingPersonId: personId,
    pinAttempts: 0,
  });
  expect(row!.expiresAt - (NOW + TEN_MIN)).toBeLessThan(1000);
  expect(row!.pinHash).not.toContain(pin);

  // claim never attaches to an existing person without the PIN
  expect(await claim(t, v)).toEqual({ error: "needs_pin" });
  expect(await sessionCount(t)).toBe(0);

  expect(await confirmPin(t, v, otherPin(pin))).toEqual({
    error: "wrong_pin",
  });
  const res = await confirmPin(t, v, pin);
  if (!("sessionToken" in res)) throw new Error(JSON.stringify(res));
  expect(res.otherSessions).toBe(0);
  const session = await t.run((ctx) => ctx.db.query("sessions").unique());
  expect(session?.personId).toBe(personId);
  expect(
    await t.query(api.sessions.me, { sessionToken: res.sessionToken }),
  ).toEqual({
    displayName: "سعيد",
    maskedPhone: "+971 50 ••• 4567",
  });
  // no second person for the same phone
  expect(
    await t.run(async (ctx) => (await ctx.db.query("people").collect()).length),
  ).toBe(1);
  // an existing account gets the normal sign-in alert, not the new-account one
  expect(sent.at(-1)!.body).toMatch(
    /^تسجيل دخول جديد إلى سلسلة من Android Chrome\. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من الأجهزة الأخرى: https:\/\/silsila\.example\/signout\?t=[A-Za-z0-9_-]{43}$/,
  );
  // the PIN is single use
  expect(await confirmPin(t, v, pin)).toEqual({ error: "expired" });
});

test("PIN accepts Arabic-Indic digits and surrounding spaces", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await send(t, v.message);
  const pin = pinsSent()[0]!;
  const arabic = pin.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]!);
  const res = await confirmPin(t, v, ` ${arabic} `);
  expect(res).toHaveProperty("sessionToken");
});

test("PIN ignores whitespace inside it", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await send(t, v.message);
  const pin = pinsSent()[0]!;
  const spaced = `${pin.slice(0, 3)} ${pin.slice(3)}`; // "123 456"
  expect(await confirmPin(t, v, spaced)).toHaveProperty("sessionToken");

  const v2 = await start(t, "سعيد", "client-2");
  await send(t, v2.message);
  const pin2 = pinsSent()[1]!;
  const messy = `\t${pin2.slice(0, 2)} ${pin2.slice(2, 4)}\u00A0${pin2.slice(4)}\n`;
  expect(await confirmPin(t, v2, messy)).toHaveProperty("sessionToken");
});

test("confirmPin reports how many other sessions the account has", async () => {
  const t = convexTest(schema, modules);
  const personId = await addPerson(t);
  for (const n of [1, 2]) {
    await t.mutation(internal.sessions.create, {
      personId,
      tokenHash: await sha256Hex(`old-${n}`),
      alertTokenHash: await sha256Hex(`old-alert-${n}`),
      deviceLabel: `old ${n}`,
    });
  }
  // another person's sessions don't count
  const other = await addPerson(t, "+971509999999", "خالد");
  await t.mutation(internal.sessions.create, {
    personId: other,
    tokenHash: await sha256Hex("other"),
    alertTokenHash: await sha256Hex("other-alert"),
    deviceLabel: "other",
  });
  const v = await start(t);
  await send(t, v.message);
  const res = await confirmPin(t, v, pinsSent()[0]!);
  expect(res).toEqual({ sessionToken: expect.any(String), otherSessions: 2 });
});

test("a forwarded link on a new number: the owner learns an account was created", async () => {
  const t = convexTest(schema, modules);
  // attacker starts, victim (no account yet) sends the forwarded message
  const attacker = await start(t, "مهاجم", "attacker");
  await send(t, attacker.message);
  expect(await claim(t, attacker)).toHaveProperty("sessionToken");
  const createdAlert = sent.at(-1)!;
  expect(createdAlert.to).toBe(PHONE);
  expect(createdAlert.body).toMatch(
    /^تمّ إنشاء حساب في سلسلة برقمك من iPhone Safari\. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من كل الأجهزة: https:\/\/silsila\.example\/signout\?t=[A-Za-z0-9_-]{43}$/,
  );

  // the real owner later signs in with the PIN and is told about the other session
  const owner = await start(t, "صاحب الرقم", "owner");
  await send(t, owner.message);
  const res = await confirmPin(t, owner, pinsSent()[0]!);
  expect(res).toEqual({ sessionToken: expect.any(String), otherSessions: 1 });
});

test("five wrong PINs lock the verification", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await send(t, v.message);
  const pin = pinsSent()[0]!;
  for (let i = 0; i < 5; i++) {
    expect(await confirmPin(t, v, otherPin(pin))).toEqual({
      error: "wrong_pin",
    });
  }
  expect(await confirmPin(t, v, otherPin(pin))).toEqual({
    error: "too_many_attempts",
  });
  // even the right PIN no longer works
  expect(await confirmPin(t, v, pin)).toEqual({ error: "too_many_attempts" });
  expect(await sessionCount(t)).toBe(0);
});

test("confirmPin checks expiry first", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await send(t, v.message);
  const pin = pinsSent()[0]!;
  vi.setSystemTime(NOW + TEN_MIN + 1);
  expect(await confirmPin(t, v, pin)).toEqual({ error: "expired" });
  expect(await sessionCount(t)).toBe(0);
});

test("duplicate webhook delivery is ignored", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message, PHONE, "wamid.dup");
  const before = await t.run((ctx) => ctx.db.get(v.verificationId));
  await send(t, v.message, PHONE, "wamid.dup");
  const after = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(after).toEqual(before);
  expect(sent).toEqual([{ to: PHONE, body: MATCHED }]);

  // a duplicate of a no-match message gets no second reply either
  await send(t, "hello", PHONE, "wamid.dup2");
  await send(t, "hello", PHONE, "wamid.dup2");
  expect(sent.filter((s) => s.body === NO_MATCH)).toHaveLength(1);
});

test("messy text still matches", async () => {
  const t = convexTest(schema, modules);
  const v = await addPending(t, "K7Q29XMB4T");
  await send(t, "تفضل k7q2 9xmb 4t شكراً");
  expect((await status(t, v)).status).toBe("matched");
  expect(sent).toEqual([{ to: PHONE, body: MATCHED }]);
});

test("Arabic-Indic digits and extra Latin words still match", async () => {
  const t = convexTest(schema, modules);
  const v = await addPending(t, "K7Q29XMB4T");
  await send(t, "Hello salam: K٧Q٢-٩XMB-٤T thanks", "971509999999");
  expect(await status(t, v)).toEqual({
    status: "matched",
    maskedPhone: "+971 50 ••• 9999",
  });
});

test("a message with no code gets one polite reply", async () => {
  const t = convexTest(schema, modules);
  const v = await addPending(t, "K7Q29XMB4T");
  await send(t, "السلام عليكم");
  await send(t, "K7Q2-9XMB-4"); // one character short
  expect(sent).toEqual([
    { to: PHONE, body: NO_MATCH },
    { to: PHONE, body: NO_MATCH },
  ]);
  expect((await status(t, v)).status).toBe("pending");
});

test("a message matches only its own verification", async () => {
  const t = convexTest(schema, modules);
  const a = await addPending(t, "AAAA2222BB", "secret-a");
  const b = await addPending(t, "CCCC3333DD", "secret-b");
  await send(t, "رمز التحقق في سلسلة: AAAA-2222-BB");
  expect((await status(t, a)).status).toBe("matched");
  expect((await status(t, b)).status).toBe("pending");
});

test("a code matches only once", async () => {
  const t = convexTest(schema, modules);
  const v = await addPending(t, "K7Q29XMB4T");
  await send(t, "K7Q2-9XMB-4T");
  await send(t, "K7Q2-9XMB-4T", "971509999999");
  const row = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(row?.phone).toBe(E164);
  expect(sent.at(-1)).toEqual({ to: "971509999999", body: NO_MATCH });
});

test("expired codes don't match", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  vi.setSystemTime(NOW + TEN_MIN + 1);
  await send(t, v.message);
  expect(sent).toEqual([{ to: PHONE, body: NO_MATCH }]);
  const row = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(row?.phone).toBeUndefined();
  expect((await status(t, v)).status).toBe("expired");
});

test("status leaks nothing for a wrong secret", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message);
  expect(
    await t.query(api.verification.status, {
      verificationId: v.verificationId,
      secret: "wrong",
    }),
  ).toEqual({ status: "expired", maskedPhone: null });
  expect(
    await t.query(api.verification.status, {
      verificationId: v.verificationId,
      secret: "",
    }),
  ).toEqual({ status: "expired", maskedPhone: null });
  // claim / reject / confirmPin with a wrong secret do nothing
  expect(
    await t.action(api.verification.claim, {
      verificationId: v.verificationId,
      secret: "wrong",
      deviceLabel: "x",
      timeZone: "Asia/Dubai",
    }),
  ).toEqual({ error: "expired" });
  await t.mutation(api.verification.reject, {
    verificationId: v.verificationId,
    secret: "wrong",
  });
  expect((await status(t, v)).status).toBe("matched");
  expect(await sessionCount(t)).toBe(0);
});

test("reject marks the verification rejected and claim then fails", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message);
  await t.mutation(api.verification.reject, {
    verificationId: v.verificationId,
    secret: v.secret,
  });
  expect(await status(t, v)).toEqual({ status: "rejected", maskedPhone: null });
  expect(await claim(t, v)).toEqual({ error: "expired" });
  expect(await sessionCount(t)).toBe(0);
  expect(await t.run((ctx) => ctx.db.query("people").collect())).toEqual([]);
});

test("a stale matched verification cannot sign in to an account created later", async () => {
  const t = convexTest(schema, modules);
  const v1 = await start(t, "مهاجم", "attacker");
  await send(t, v1.message);
  expect((await status(t, v1)).status).toBe("matched");

  const v2 = await start(t, "صاحب الرقم", "owner");
  await send(t, v2.message);
  const ok = await claim(t, v2);
  expect(ok).toHaveProperty("sessionToken");
  expect(await sessionCount(t)).toBe(1);

  const before = pinsSent().length;
  expect(await claim(t, v1)).toEqual({ error: "needs_pin" });
  expect(pinsSent()).toHaveLength(before + 1);
  expect(await sessionCount(t)).toBe(1);
  expect(
    await t.run(async (ctx) => (await ctx.db.query("people").collect()).length),
  ).toBe(1);
  expect((await status(t, v1)).status).toBe("needs_pin");
});

test("concurrent claims of one verification create at most one session", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message);
  const results = await Promise.all([claim(t, v), claim(t, v), claim(t, v)]);
  expect(results.filter((r) => "sessionToken" in r)).toHaveLength(1);
  expect(await sessionCount(t)).toBe(1);
  expect(
    await t.run(async (ctx) => (await ctx.db.query("people").collect()).length),
  ).toBe(1);
});

test("claim after expiry fails", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message);
  const { expiresAt } = (await t.run((ctx) => ctx.db.get(v.verificationId)))!;
  vi.setSystemTime(expiresAt);
  expect(await claim(t, v)).toEqual({ error: "expired" });
  expect(await sessionCount(t)).toBe(0);
});

test("a message at 9m59s still leaves about ten minutes to claim", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  vi.advanceTimersByTime(TEN_MIN - 1000);
  await send(t, v.message);
  const row = (await t.run((ctx) => ctx.db.get(v.verificationId)))!;
  expect(row.status).toBe("matched");
  expect(row.expiresAt - (NOW + TEN_MIN - 1000 + TEN_MIN)).toBeLessThan(1000);
  expect(row.expiresAt).toBeGreaterThanOrEqual(NOW + TEN_MIN - 1000 + TEN_MIN);

  // the original timer fires at +10 min and must not expire it
  vi.advanceTimersByTime(1000);
  await t.finishInProgressScheduledFunctions();
  expect((await status(t, v)).status).toBe("matched");

  // 9 minutes after the message it can still be claimed
  vi.advanceTimersByTime(9 * 60_000);
  await t.finishInProgressScheduledFunctions();
  expect(await claim(t, v)).toHaveProperty("sessionToken");
});

test("a matched verification left unclaimed expires on the fresh timer", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  vi.advanceTimersByTime(5 * 60_000);
  await send(t, v.message);
  const { expiresAt } = (await t.run((ctx) => ctx.db.get(v.verificationId)))!;
  vi.advanceTimersByTime(expiresAt - Date.now() - 1);
  await t.finishInProgressScheduledFunctions();
  expect((await t.run((ctx) => ctx.db.get(v.verificationId)))!.status).toBe(
    "matched",
  );
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect((await t.run((ctx) => ctx.db.get(v.verificationId)))!.status).toBe(
    "expired",
  );
});

test("an unanswered verification becomes expired on time", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  vi.advanceTimersByTime(TEN_MIN - 1);
  await t.finishInProgressScheduledFunctions();
  expect((await t.run((ctx) => ctx.db.get(v.verificationId)))?.status).toBe(
    "pending",
  );
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  expect((await t.run((ctx) => ctx.db.get(v.verificationId)))?.status).toBe(
    "expired",
  );
  expect(await status(t, v)).toEqual({ status: "expired", maskedPhone: null });
});

test("needs_pin gets a fresh expiry that the old timer doesn't cut short", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  vi.advanceTimersByTime(5 * 60_000);
  await send(t, v.message);
  const row = await t.run((ctx) => ctx.db.get(v.verificationId));
  expect(row?.expiresAt).toBe(NOW + 5 * 60_000 + TEN_MIN);
  // the original timer fires at +10 min but the PIN is still valid
  vi.advanceTimersByTime(5 * 60_000);
  await t.finishInProgressScheduledFunctions();
  expect((await status(t, v)).status).toBe("needs_pin");
  // the fresh timer fires at +15 min
  vi.advanceTimersByTime(5 * 60_000);
  await t.finishInProgressScheduledFunctions();
  expect((await t.run((ctx) => ctx.db.get(v.verificationId)))?.status).toBe(
    "expired",
  );
});

test("concurrent redelivery sends one PIN", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await Promise.all([
    send(t, v.message, PHONE, "wamid.same"),
    send(t, v.message, PHONE, "wamid.same"),
  ]);
  expect(sent).toHaveLength(1);
  expect(pinsSent()).toHaveLength(1);
});

test("two different messages racing for one code send one reply that matters", async () => {
  const t = convexTest(schema, modules);
  await addPerson(t);
  const v = await start(t);
  await Promise.all([
    send(t, v.message, PHONE, "wamid.x"),
    send(t, v.message, PHONE, "wamid.y"),
  ]);
  // exactly one PIN; the loser sees no pending code
  expect(pinsSent()).toHaveLength(1);
  expect(sent.filter((s) => s.body === NO_MATCH)).toHaveLength(1);
  expect((await status(t, v)).status).toBe("needs_pin");
});

test("messages from one phone are rate-limited without replies", async () => {
  const t = convexTest(schema, modules);
  for (let i = 0; i < 12; i++) await send(t, "hello");
  expect(sent).toHaveLength(10);
});

test("prod without WhatsApp config refuses to start", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("SILSILA_ENV", "prod");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  expect(
    await t.action(internal.verification.startInternal, {
      displayName: "علي",
      clientKey: "c1",
      ip: null,
    }),
  ).toEqual({ error: "whatsapp_not_configured" });
  expect(await t.run((ctx) => ctx.db.query("verifications").collect())).toEqual(
    [],
  );

  const res = await t.fetch("/api/verification/start", {
    method: "POST",
    headers: { Origin: SITE },
    body: JSON.stringify({ displayName: "علي", clientKey: "c1" }),
  });
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "whatsapp_not_configured" });

  // fully configured prod starts fine
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  expect(
    await t.action(internal.verification.startInternal, {
      displayName: "علي",
      clientKey: "c1",
      ip: null,
    }),
  ).not.toHaveProperty("error");
});

test("simulateIncoming in dev runs the real handler", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await t.action(internal.dev.simulateIncoming, {
    from: PHONE,
    text: v.message,
  });
  expect((await status(t, v)).status).toBe("matched");
});

test("device labels are sanitized before reaching the WhatsApp alert", async () => {
  const t = convexTest(schema, modules);
  const v = await start(t);
  await send(t, v.message);
  const res = await claim(
    t,
    v,
    "Chrome‮ https://evil.example/x?y=1 " + "z".repeat(100),
  );
  expect(res).toHaveProperty("sessionToken");
  const session = await t.run((ctx) => ctx.db.query("sessions").unique());
  expect(session!.deviceLabel).not.toMatch(/[:/?=.‮]/);
  expect(Array.from(session!.deviceLabel).length).toBeLessThanOrEqual(40);
  expect(sent.at(-1)!.body).not.toContain("evil.example");
});
