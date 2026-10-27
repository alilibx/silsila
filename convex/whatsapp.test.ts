import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import { hmacSha256Hex } from "./lib/crypto";
import schema from "./schema";
import { parseIncoming } from "./whatsapp";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const APP_SECRET = "test-app-secret";

type Sent = { url: string; auth: string; to: string; body: string };
let sent: Sent[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("SILSILA_ENV", "dev");
  vi.stubEnv("WHATSAPP_PUBLIC_NUMBER", "971500000000");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubEnv("WHATSAPP_APP_SECRET", APP_SECRET);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "test-verify-token");
  vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v21.0");
  vi.stubEnv("SITE_URL", "https://silsila.example");
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as {
        to: string;
        text: { body: string };
      };
      sent.push({
        url,
        auth: new Headers(init.headers).get("Authorization") ?? "",
        to: payload.to,
        body: payload.text.body,
      });
      return new Response(JSON.stringify({ messages: [{ id: "out" }] }), {
        status: 200,
      });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function webhook(
  messages: unknown[],
  extra: Record<string, unknown> = {},
): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "971500000000",
                phone_number_id: "1234567890",
              },
              contacts: [{ profile: { name: "Ali" }, wa_id: "971501234567" }],
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

const sampleWebhook = webhook([
  {
    from: "971501234567",
    id: "wamid.1",
    timestamp: "1800000000",
    type: "text",
    text: { body: "رمز التحقق في سلسلة: K7Q2-9XMB-4T" },
  },
]);

test("parseIncoming extracts text messages", () => {
  expect(parseIncoming(sampleWebhook)).toEqual([
    {
      waMessageId: "wamid.1",
      from: "971501234567",
      text: "رمز التحقق في سلسلة: K7Q2-9XMB-4T",
    },
  ]);
  expect(
    parseIncoming({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }),
  ).toEqual([]);
});

test("parseIncoming ignores non-text messages and malformed input", () => {
  expect(parseIncoming(null)).toEqual([]);
  expect(parseIncoming("nope")).toEqual([]);
  expect(parseIncoming({ entry: "x" })).toEqual([]);
  expect(parseIncoming({ entry: [null, { changes: [null] }] })).toEqual([]);
  expect(
    parseIncoming(
      webhook([
        { from: "971501234567", id: "wamid.img", type: "image", image: {} },
        { from: "971501234567", id: "wamid.bad", type: "text", text: {} },
        { from: "+97150", id: "wamid.from", type: "text", text: { body: "x" } },
        { from: "971501234567", type: "text", text: { body: "no id" } },
        {
          from: "971501234567",
          id: "wamid.ok",
          type: "text",
          text: { body: "hi" },
        },
      ]),
    ),
  ).toEqual([{ waMessageId: "wamid.ok", from: "971501234567", text: "hi" }]);
});

test("recordInbound returns true once per message id", async () => {
  const t = convexTest(schema, modules);
  expect(
    await t.mutation(internal.whatsapp.recordInbound, { waMessageId: "w1" }),
  ).toBe(true);
  expect(
    await t.mutation(internal.whatsapp.recordInbound, { waMessageId: "w1" }),
  ).toBe(false);
  expect(
    await t.mutation(internal.whatsapp.recordInbound, { waMessageId: "w2" }),
  ).toBe(true);
});

test("sendText posts to the Graph API with the bearer token", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.whatsapp.sendText, {
    to: "+971501234567",
    body: "مرحبا",
  });
  expect(sent).toEqual([
    {
      url: "https://graph.facebook.com/v21.0/1234567890/messages",
      auth: "Bearer test-access-token",
      to: "971501234567",
      body: "مرحبا",
    },
  ]);
  const init = vi.mocked(fetch).mock.calls[0]![1]!;
  expect(init.method).toBe("POST");
  expect(JSON.parse(String(init.body))).toEqual({
    messaging_product: "whatsapp",
    to: "971501234567",
    type: "text",
    text: { body: "مرحبا" },
  });
});

test("sendText in dev without a token logs instead of sending", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await t.action(internal.whatsapp.sendText, {
    to: "+971501234567",
    body: "رمز الدخول إلى سلسلة: 123456",
  });
  expect(sent).toEqual([]);
  expect(log.mock.calls.flat().join(" ")).toContain(
    "رمز الدخول إلى سلسلة: 123456",
  );
});

test("sendText in prod never logs message bodies", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("SILSILA_ENV", "prod");
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {}),
  );
  const logged = () =>
    spies.flatMap((s) => s.mock.calls.flat().map(String)).join(" ");
  const body = "رمز الدخول إلى سلسلة: 654321";

  // missing token: not sent, not logged
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  await t.action(internal.whatsapp.sendText, { to: "+971501234567", body });
  expect(sent).toEqual([]);
  expect(logged()).not.toContain("654321");

  // Graph API failure: logged without the body
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-access-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("bad", { status: 500 })),
  );
  await t.action(internal.whatsapp.sendText, { to: "+971501234567", body });
  expect(logged()).not.toContain("654321");
  expect(logged()).toContain("500");
});

test("webhook rejects a bad signature", async () => {
  const t = convexTest(schema, modules);
  const body = JSON.stringify(sampleWebhook);
  const bad = await t.fetch("/whatsapp/webhook", {
    method: "POST",
    headers: { "X-Hub-Signature-256": "sha256=00" },
    body,
  });
  expect(bad.status).toBe(401);
  const missing = await t.fetch("/whatsapp/webhook", { method: "POST", body });
  expect(missing.status).toBe(401);
  // signed with another secret
  const other = await t.fetch("/whatsapp/webhook", {
    method: "POST",
    headers: {
      "X-Hub-Signature-256": `sha256=${await hmacSha256Hex("other", body)}`,
    },
    body,
  });
  expect(other.status).toBe(401);
  // nothing recorded or scheduled
  const rows = await t.run((ctx) => ctx.db.query("inboundMessages").collect());
  expect(rows).toEqual([]);
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(jobs).toEqual([]);
});

test("webhook with a valid signature schedules handleIncoming per message", async () => {
  const t = convexTest(schema, modules);
  const body = JSON.stringify(
    webhook([
      {
        from: "971501234567",
        id: "wamid.1",
        type: "text",
        text: { body: "hello" },
      },
      {
        from: "971509999999",
        id: "wamid.2",
        type: "text",
        text: { body: "hi" },
      },
    ]),
  );
  const res = await t.fetch("/whatsapp/webhook", {
    method: "POST",
    headers: {
      "X-Hub-Signature-256": `sha256=${await hmacSha256Hex(APP_SECRET, body)}`,
    },
    body,
  });
  expect(res.status).toBe(200);
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(jobs.map((j) => [j.name, j.args[0]])).toEqual([
    [
      "whatsapp:handleIncoming",
      { waMessageId: "wamid.1", from: "971501234567", text: "hello" },
    ],
    [
      "whatsapp:handleIncoming",
      { waMessageId: "wamid.2", from: "971509999999", text: "hi" },
    ],
  ]);

  // a signed status-only callback is acknowledged and schedules nothing more
  const statusBody = JSON.stringify(webhook([], { statuses: [{}] }));
  const res2 = await t.fetch("/whatsapp/webhook", {
    method: "POST",
    headers: {
      "X-Hub-Signature-256": `sha256=${await hmacSha256Hex(APP_SECRET, statusBody)}`,
    },
    body: statusBody,
  });
  expect(res2.status).toBe(200);
});

test("webhook verify handshake echoes the challenge only for the right token", async () => {
  const t = convexTest(schema, modules);
  const ok = await t.fetch(
    "/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=12345",
  );
  expect(ok.status).toBe(200);
  expect(await ok.text()).toBe("12345");

  const wrong = await t.fetch(
    "/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345",
  );
  expect(wrong.status).toBe(403);
  const mode = await t.fetch(
    "/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=1",
  );
  expect(mode.status).toBe(403);

  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
  const unset = await t.fetch(
    "/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1",
  );
  expect(unset.status).toBe(403);
});

test("simulateIncoming refuses to run outside dev", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("SILSILA_ENV", "prod");
  await expect(
    t.action(internal.dev.simulateIncoming, {
      from: "971501234567",
      text: "hi",
    }),
  ).rejects.toThrow(/dev/);
  expect(
    await t.run((ctx) => ctx.db.query("inboundMessages").collect()),
  ).toEqual([]);
});
