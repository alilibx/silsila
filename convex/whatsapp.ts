import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { hmacSha256Hex, randomPin, sha256Hex } from "./lib/crypto";

// ---------------------------------------------------------------------------
// Environment

// Convex provides `process.env` in every runtime; the project doesn't pull in
// @types/node, so declare just what this module reads.
declare const process: { env: Record<string, string | undefined> };

/** Variables every deployment needs to hand out codes and send replies. */
const SEND_ENV = [
  "WHATSAPP_PUBLIC_NUMBER",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "SITE_URL",
] as const;

/** What the Meta webhook needs (production, which Meta calls). */
const META_ENV = ["WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"] as const;

type EnvName =
  | (typeof SEND_ENV)[number]
  | (typeof META_ENV)[number]
  // Where production relays messages it has no code for, and the secret
  // both sides sign and check those relays with.
  | "WHATSAPP_RELAY_URL"
  | "WHATSAPP_RELAY_SECRET"
  // Only the link-preview endpoint reads this.
  | "PREVIEW_SECRET";

/** An environment variable, treating the empty string as unset. */
export function env(name: EnvName): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

/**
 * Only an explicit `WIRDAK_ENV=dev` relaxes anything; an unset or unknown
 * value behaves like prod (strict config, no message bodies in logs).
 */
export function isDev(): boolean {
  return process.env.WIRDAK_ENV === "dev";
}

/** Shorter relay secrets are treated as unset (`openssl rand -hex 32` is 64). */
const MIN_RELAY_SECRET = 32;

/** `WHATSAPP_RELAY_SECRET`, if it is long enough to trust. */
export function relaySecret(): string | undefined {
  const secret = env("WHATSAPP_RELAY_SECRET");
  return secret !== undefined && secret.length >= MIN_RELAY_SECRET
    ? secret
    : undefined;
}

/**
 * Where this deployment's incoming messages come from: Meta's webhook when it
 * holds the app secret (production), else production's relay when it holds
 * only the relay secret (staging, which shares production's number). Never
 * both, so a relay secret can't be used to inject messages into production.
 */
export function inboundSource(): "meta" | "relay" | null {
  if (env("WHATSAPP_APP_SECRET") !== undefined) return "meta";
  if (relaySecret() !== undefined) return "relay";
  return null;
}

export function whatsappConfigured(): boolean {
  if (!SEND_ENV.every((name) => env(name) !== undefined)) return false;
  switch (inboundSource()) {
    case "meta":
      return META_ENV.every((name) => env(name) !== undefined);
    case "relay":
      return true;
    case null:
      return false;
  }
}

/** `SITE_URL` without a trailing slash; dev falls back to the Vite dev server. */
export function siteUrl(): string {
  const url = env("SITE_URL") ?? (isDev() ? "http://localhost:5173" : "");
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Message texts (sent verbatim)

export const verificationMessage = (code: string) =>
  `رمز التحقق في وِردك: ${code}`;
export const NO_MATCH_REPLY =
  "لم نجد رمز تحقق صالحاً. ارجع إلى وِردك واضغط «تحقّق عبر واتساب» ثم أرسل الرسالة الجاهزة كما هي.";
/** Says what the code is for, so a forwarded-link victim knows not to hand it over. */
export const pinReply = (pin: string) =>
  `رمز الدخول إلى وِردك: ${pin}\nهذا الرمز يُدخل جهازاً جديداً إلى حسابك. لا تعطه لأحد، فوِردك لا يطلبه منك أبداً. إن لم تطلبه الآن فتجاهل هذه الرسالة.`;
const VERIFIED = "تمّ التحقق ✅ ارجع إلى وِردك لتكمل.";
const signInAlert = (deviceLabel: string) =>
  `تسجيل دخول جديد إلى وِردك من ${deviceLabel}. إن لم تكن أنت، اضغط «لستُ أنا» لتسجيل الخروج من الأجهزة الأخرى.`;
/** Sent instead of `signInAlert` when the sign-in created the account. */
const accountCreatedAlert = (deviceLabel: string) =>
  `تمّ إنشاء حساب في وِردك برقمك من ${deviceLabel}. إن لم تكن أنت، اضغط «لستُ أنا» لتسجيل الخروج من كل الأجهزة.`;

/** Meta's authentication template: the PIN with a copy-code button. */
export const PIN_TEMPLATE = "wirdak_pin";

/**
 * The 6-digit PIN as the authentication template, whose copy-code button
 * takes the PIN too. Falls back to the text reply if the template is refused
 * (paused, or not approved yet), so a sign-in never waits on Meta.
 */
export async function sendPin(to: string, pin: string): Promise<boolean> {
  const sent = await sendWhatsAppTemplate(to, {
    name: PIN_TEMPLATE,
    body: [pin],
    buttonParam: pin,
  });
  return sent || (await sendWhatsAppText(to, pinReply(pin)));
}

/**
 * The "verified" reply (spec 5.2 step 5), with a button back to the page the
 * sign-in started on (already cleaned by `cleanReturnPath`) on this
 * deployment's own `SITE_URL`, so staging links stay on staging.
 */
export async function sendVerified(
  to: string,
  returnPath = "/",
): Promise<boolean> {
  const url = siteUrl();
  if (!url) return await sendWhatsAppText(to, VERIFIED);
  const path = returnPath === "/" ? "" : returnPath;
  return await sendWhatsAppLink(to, VERIFIED, {
    label: "ارجع إلى وِردك",
    url: `${url}${path}`,
  });
}

/** The new sign-in (or new account) alert, whose button signs the other devices out. */
export async function sendSignInAlert(
  to: string,
  created: boolean,
  deviceLabel: string,
  alertToken: string,
): Promise<boolean> {
  return await sendWhatsAppLink(
    to,
    created ? accountCreatedAlert(deviceLabel) : signInAlert(deviceLabel),
    { label: "لستُ أنا", url: `${siteUrl()}/signout?t=${alertToken}` },
  );
}

// ---------------------------------------------------------------------------
// Inbound parsing

/** WhatsApp `from` / `wa_id`: country code + number, digits only (E.164 without `+`). */
export const WA_PHONE = /^[1-9]\d{6,14}$/;
const MAX_MESSAGE_ID = 256;
/** WhatsApp caps text messages at 4096 characters. */
const MAX_TEXT = 4096;
/** Only this much of an incoming message is scanned for a code (or relayed). */
export const MAX_SCANNED_TEXT = 500;

export type IncomingMessage = {
  waMessageId: string;
  from: string;
  text: string;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** A message from untrusted fields, or `null` unless all three are well-formed. */
function toMessage(
  id: unknown,
  from: unknown,
  text: unknown,
): IncomingMessage | null {
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > MAX_MESSAGE_ID ||
    typeof from !== "string" ||
    !WA_PHONE.test(from) ||
    typeof text !== "string"
  ) {
    return null;
  }
  return { waMessageId: id, from, text };
}

/**
 * Text messages from a Cloud API webhook payload. Anything that isn't a
 * well-formed text message (statuses, media, malformed entries) is skipped.
 * With `onlyPhoneNumberId`, messages addressed to any other business number
 * (`value.metadata.phone_number_id`), or with no metadata, are skipped too.
 */
export function parseIncoming(
  payload: unknown,
  onlyPhoneNumberId?: string,
): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  if (!isObject(payload) || !Array.isArray(payload.entry)) return out;
  for (const entry of payload.entry) {
    if (!isObject(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isObject(change) || !isObject(change.value)) continue;
      if (onlyPhoneNumberId !== undefined) {
        const metadata = change.value.metadata;
        if (
          !isObject(metadata) ||
          metadata.phone_number_id !== onlyPhoneNumberId
        ) {
          continue;
        }
      }
      const messages = change.value.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        if (!isObject(m) || m.type !== "text" || !isObject(m.text)) continue;
        const message = toMessage(m.id, m.from, m.text.body);
        if (message === null) continue;
        out.push({ ...message, text: message.text.slice(0, MAX_TEXT) });
      }
    }
  }
  return out;
}

/** The message in a relay call (`relayIncoming` below), or `null` if malformed. */
export function parseRelayed(payload: unknown): IncomingMessage | null {
  if (!isObject(payload)) return null;
  const message = toMessage(payload.waMessageId, payload.from, payload.text);
  return message !== null && message.text.length <= MAX_SCANNED_TEXT
    ? message
    : null;
}

// ---------------------------------------------------------------------------
// Outbound

const SEND_ATTEMPTS = 2;
const SEND_RETRY_DELAY_MS = 500;

/** A template send: the header and body texts, and the first button's parameter. */
export type TemplateMessage = {
  name: string;
  header?: string;
  body?: string[];
  buttonParam?: string;
};

/**
 * WhatsApp refuses template parameters with newlines, tabs or more than four
 * spaces in a row, so every run of whitespace becomes one space.
 */
export function cleanParam(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

const textParams = (values: string[]) =>
  values.map((text) => ({ type: "text", text: cleanParam(text) }));

/**
 * A message payload as one readable string: the text; the text, then the
 * button as `[label] url`; or `[template name]` and its parameters joined
 * by ` | `. Dev logs print it, and tests compare it.
 */
export function describeMessage(payload: unknown): string {
  if (!isObject(payload)) return "";
  if (isObject(payload.text)) return String(payload.text.body);
  const interactive = payload.interactive;
  if (isObject(interactive)) {
    const body = isObject(interactive.body) ? interactive.body.text : "";
    const action = isObject(interactive.action) ? interactive.action : {};
    const button = isObject(action.parameters) ? action.parameters : {};
    return `${String(body)}\n[${String(button.display_text)}] ${String(button.url)}`;
  }
  const template = payload.template;
  if (isObject(template)) {
    const components = Array.isArray(template.components)
      ? template.components
      : [];
    const params = components.flatMap((c: unknown) =>
      isObject(c) && Array.isArray(c.parameters)
        ? c.parameters.map((p: unknown) => (isObject(p) ? String(p.text) : ""))
        : [],
    );
    return `[${String(template.name)}] ${params.join(" | ")}`;
  }
  return "";
}

/**
 * Posts one message payload to the Graph API. Never throws: a failed reply
 * must not undo the state change that triggered it. The message (which may
 * hold a PIN or a sign-out link) is logged only in dev when no access token is
 * set; prod logs keep to the HTTP status and Graph error code.
 */
async function postMessage(
  to: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const digits = to.replace(/\D/g, "");
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!token) {
    if (isDev()) {
      console.log(`[whatsapp:dev] to +${digits}:\n${describeMessage(payload)}`);
      return true;
    }
    console.error("whatsapp_not_configured: reply not sent");
    return false;
  }
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  const version = env("WHATSAPP_GRAPH_VERSION");
  if (!phoneNumberId || !version) {
    console.error("whatsapp_not_configured: reply not sent");
    return false;
  }
  const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: digits,
      ...payload,
    }),
  };
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      console.error(
        `whatsapp send failed: ${err instanceof Error ? err.name : "error"}`,
      );
      return false;
    }
    if (res.ok) return true;
    console.error(
      `whatsapp send failed: HTTP ${res.status}${await errorDetail(res)}`,
    );
    // Throttling and server errors are retried once; other 4xx never are.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= SEND_ATTEMPTS) return false;
    await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_DELAY_MS));
  }
}

/**
 * The whole error body in dev; in prod only Graph's numeric error code, which
 * describes the request and never echoes the message.
 */
async function errorDetail(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  if (isDev()) return ` ${raw}`;
  try {
    const parsed: unknown = JSON.parse(raw);
    const code =
      isObject(parsed) && isObject(parsed.error) ? parsed.error.code : null;
    return typeof code === "number" ? ` code ${code}` : "";
  } catch {
    return "";
  }
}

/** A free-form text message (only delivered inside the 24-hour window). */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<boolean> {
  return await postMessage(to, { type: "text", text: { body } });
}

/** An approved template in Arabic; empty components are left out. */
export async function sendWhatsAppTemplate(
  to: string,
  message: TemplateMessage,
): Promise<boolean> {
  const components: Record<string, unknown>[] = [];
  if (message.header !== undefined) {
    components.push({
      type: "header",
      parameters: textParams([message.header]),
    });
  }
  if (message.body && message.body.length > 0) {
    components.push({ type: "body", parameters: textParams(message.body) });
  }
  if (message.buttonParam !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: textParams([message.buttonParam]),
    });
  }
  return await postMessage(to, {
    type: "template",
    template: { name: message.name, language: { code: "ar" }, components },
  });
}

/** A text with one link button (inside the 24-hour window, no template needed). */
export async function sendWhatsAppLink(
  to: string,
  body: string,
  button: { label: string; url: string },
): Promise<boolean> {
  return await postMessage(to, {
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body },
      action: {
        name: "cta_url",
        parameters: { display_text: button.label, url: button.url },
      },
    },
  });
}

export const sendText = internalAction({
  args: { to: v.string(), body: v.string() },
  handler: async (_ctx, args): Promise<boolean> =>
    await sendWhatsAppText(args.to, args.body),
});

// ---------------------------------------------------------------------------
// Relay (production → staging)
//
// Staging shares production's number, so Meta delivers every message to
// production. A message production has no pending code for is relayed to
// staging, which answers whether one of its own codes took it. Staging then
// sends its own reply (with its own `SITE_URL`); production replies only if
// staging didn't take it, couldn't be reached, or took too long. Staging sends
// before it answers, so its reply is never left waiting in a queue (a PIN
// would be stored there in the clear); the timeout leaves room for that.

export const RELAY_TIMESTAMP_HEADER = "X-Wirdak-Relay-Timestamp";
export const RELAY_SIGNATURE_HEADER = "X-Wirdak-Relay-Signature";
/** Relays older or newer than this are refused (replays are deduped anyway). */
export const RELAY_MAX_SKEW_MS = 5 * 60_000;
const RELAY_TIMEOUT_MS = 10_000;

/** `sha256=<hex>` of HMAC-SHA256(secret, `<timestamp>.<body>`). */
export async function relaySignature(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  return `sha256=${await hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

/**
 * Relays a message to `WHATSAPP_RELAY_URL` and returns `true` only if the
 * other deployment took it (and so sends the reply). Never throws: any
 * failure returns `false`, so production still answers the person.
 */
export async function relayIncoming(
  message: IncomingMessage,
): Promise<boolean> {
  const url = env("WHATSAPP_RELAY_URL");
  const secret = relaySecret();
  if (url === undefined || secret === undefined) return false;
  // Only a deployment that Meta calls relays, so two can't relay in a loop.
  if (inboundSource() !== "meta") return false;
  if (!url.startsWith("https://") && !isDev()) {
    console.error("whatsapp relay: WHATSAPP_RELAY_URL is not https");
    return false;
  }
  // Staging scans no further than this, so nothing more leaves production.
  const body = JSON.stringify({
    ...message,
    text: message.text.slice(0, MAX_SCANNED_TEXT),
  });
  const timestamp = String(Date.now());
  const signature = await relaySignature(secret, timestamp, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [RELAY_TIMESTAMP_HEADER]: timestamp,
        [RELAY_SIGNATURE_HEADER]: signature,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`whatsapp relay failed: HTTP ${res.status}`);
      return false;
    }
    const out: unknown = await res.json();
    return isObject(out) && out.handled === true;
  } catch (err) {
    console.error(
      `whatsapp relay failed: ${err instanceof Error ? err.name : "error"}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Inbound handling

/**
 * Dedupe for webhook redeliveries: inserts the ID and returns `true` only if it
 * wasn't already there. One mutation, so concurrent redeliveries can't both pass.
 */
export const recordInbound = internalMutation({
  args: { waMessageId: v.string() },
  handler: async (ctx, { waMessageId }): Promise<boolean> => {
    const seen = await ctx.db
      .query("inboundMessages")
      .withIndex("by_waMessageId", (q) => q.eq("waMessageId", waMessageId))
      .first();
    if (seen) return false;
    await ctx.db.insert("inboundMessages", {
      waMessageId,
      receivedAt: Date.now(),
    });
    return true;
  },
});

/**
 * Dedupes and matches one message and sends the reply for a match. Returns
 * `"taken"` when nothing more should be sent (a match, a duplicate, a bad
 * sender, or a rate-limited phone), else whether the text could hold a code.
 */
export async function takeIncoming(
  ctx: ActionCtx,
  message: IncomingMessage,
): Promise<"taken" | "no_code" | "unknown_code"> {
  if (!WA_PHONE.test(message.from)) return "taken";
  const fresh = await ctx.runMutation(internal.whatsapp.recordInbound, {
    waMessageId: message.waMessageId,
  });
  if (!fresh) return "taken";

  const phone = `+${message.from}`;
  // Generated here (never in a mutation); used only if the number already
  // has an account.
  const pin = randomPin();
  const result = await ctx.runMutation(internal.verification.matchIncoming, {
    phone,
    text: message.text,
    pinHash: await sha256Hex(pin),
  });
  switch (result.kind) {
    case "rate_limited":
      return "taken";
    case "no_match":
      return result.codeShaped ? "unknown_code" : "no_code";
    case "matched":
      await sendVerified(phone, result.returnPath);
      return "taken";
    case "needs_pin":
      await sendPin(phone, pin);
      return "taken";
  }
}

/** A message from Meta's webhook. */
export const handleIncoming = internalAction({
  args: { waMessageId: v.string(), from: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const outcome = await takeIncoming(ctx, args);
    if (outcome === "taken") return;
    // A code we don't have may have been started on staging.
    if (outcome === "unknown_code" && (await relayIncoming(args))) return;
    await sendWhatsAppText(`+${args.from}`, NO_MATCH_REPLY);
  },
});
