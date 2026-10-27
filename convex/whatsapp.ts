import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { randomPin, sha256Hex } from "./lib/crypto";

// ---------------------------------------------------------------------------
// Environment

// Convex provides `process.env` in every runtime; the project doesn't pull in
// @types/node, so declare just what this module reads.
declare const process: { env: Record<string, string | undefined> };

/** Variables a production deployment needs before it can verify anyone. */
const REQUIRED_ENV = [
  "WHATSAPP_PUBLIC_NUMBER",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_VERSION",
  "SITE_URL",
] as const;

type EnvName = (typeof REQUIRED_ENV)[number];

/** An environment variable, treating the empty string as unset. */
export function env(name: EnvName): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

/**
 * Only an explicit `SILSILA_ENV=dev` relaxes anything; an unset or unknown
 * value behaves like prod (strict config, no message bodies in logs).
 */
export function isDev(): boolean {
  return process.env.SILSILA_ENV === "dev";
}

export function whatsappConfigured(): boolean {
  return REQUIRED_ENV.every((name) => env(name) !== undefined);
}

/** `SITE_URL` without a trailing slash; dev falls back to the Vite dev server. */
export function siteUrl(): string {
  const url = env("SITE_URL") ?? (isDev() ? "http://localhost:5173" : "");
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Message texts (sent verbatim)

export const verificationMessage = (code: string) =>
  `رمز التحقق في سلسلة: ${code}`;
export const NO_MATCH_REPLY =
  "لم نجد رمز تحقق صالحاً. ارجع إلى سلسلة واضغط «تحقّق عبر واتساب» ثم أرسل الرسالة الجاهزة كما هي.";
export const MATCHED_REPLY = "تمّ التحقق ✅ ارجع إلى سلسلة لتكمل.";
export const pinReply = (pin: string) =>
  `رمز الدخول إلى سلسلة: ${pin}\nلا تشاركه مع أحد.`;
export const signInAlert = (deviceLabel: string, alertToken: string) =>
  `تسجيل دخول جديد إلى سلسلة من ${deviceLabel}. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من الأجهزة الأخرى: ${siteUrl()}/signout?t=${alertToken}`;
/** Sent instead of `signInAlert` when the sign-in created the account. */
export const accountCreatedAlert = (deviceLabel: string, alertToken: string) =>
  `تمّ إنشاء حساب في سلسلة برقمك من ${deviceLabel}. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من كل الأجهزة: ${siteUrl()}/signout?t=${alertToken}`;

// ---------------------------------------------------------------------------
// Inbound parsing

/** WhatsApp `from` / `wa_id`: country code + number, digits only (E.164 without `+`). */
export const WA_PHONE = /^[1-9]\d{6,14}$/;
const MAX_MESSAGE_ID = 256;
/** WhatsApp caps text messages at 4096 characters. */
const MAX_TEXT = 4096;

export type IncomingMessage = {
  waMessageId: string;
  from: string;
  text: string;
};

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
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
        if (
          !isObject(m) ||
          m.type !== "text" ||
          typeof m.id !== "string" ||
          m.id.length === 0 ||
          m.id.length > MAX_MESSAGE_ID ||
          typeof m.from !== "string" ||
          !WA_PHONE.test(m.from) ||
          !isObject(m.text) ||
          typeof m.text.body !== "string"
        ) {
          continue;
        }
        out.push({
          waMessageId: m.id,
          from: m.from,
          text: m.text.body.slice(0, MAX_TEXT),
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Outbound

const SEND_ATTEMPTS = 2;
const SEND_RETRY_DELAY_MS = 500;

/**
 * Sends a text message through the Graph API. Never throws: a failed reply
 * must not undo the state change that triggered it. Message bodies (PINs,
 * sign-out links) are logged only in dev when no access token is set.
 */
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<boolean> {
  const digits = to.replace(/\D/g, "");
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!token) {
    if (isDev()) {
      console.log(`[whatsapp:dev] to +${digits}:\n${body}`);
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
      type: "text",
      text: { body },
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
    // Graph errors describe the request, not the message body, but keep
    // prod logs to the status code.
    const detail = isDev() ? ` ${await res.text()}` : "";
    console.error(`whatsapp send failed: HTTP ${res.status}${detail}`);
    // Throttling and server errors are retried once; other 4xx never are.
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= SEND_ATTEMPTS) return false;
    await new Promise((resolve) => setTimeout(resolve, SEND_RETRY_DELAY_MS));
  }
}

export const sendText = internalAction({
  args: { to: v.string(), body: v.string() },
  handler: async (_ctx, args): Promise<boolean> =>
    await sendWhatsAppText(args.to, args.body),
});

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

export const handleIncoming = internalAction({
  args: { waMessageId: v.string(), from: v.string(), text: v.string() },
  handler: async (ctx, args): Promise<void> => {
    if (!WA_PHONE.test(args.from)) return;
    const fresh = await ctx.runMutation(internal.whatsapp.recordInbound, {
      waMessageId: args.waMessageId,
    });
    if (!fresh) return;

    const phone = `+${args.from}`;
    // Generated here (never in a mutation); used only if the number already
    // has an account.
    const pin = randomPin();
    const result = await ctx.runMutation(internal.verification.matchIncoming, {
      phone,
      text: args.text,
      pinHash: await sha256Hex(pin),
    });
    switch (result) {
      case "rate_limited":
        return;
      case "no_match":
        await sendWhatsAppText(phone, NO_MATCH_REPLY);
        return;
      case "matched":
        await sendWhatsAppText(phone, MATCHED_REPLY);
        return;
      case "needs_pin":
        await sendWhatsAppText(phone, pinReply(pin));
        return;
    }
  },
});
