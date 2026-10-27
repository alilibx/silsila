import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { hmacSha256Hex, timingSafeEqual } from "./lib/crypto";
import { env, parseIncoming, siteUrl } from "./whatsapp";

const http = httpRouter();

// ---------------------------------------------------------------------------
// POST /api/verification/start

const DEV_ORIGIN = "http://localhost:5173";
const MAX_START_BODY = 4096;
const MAX_DISPLAY_NAME_INPUT = 1000;
const MAX_CLIENT_KEY = 200;
const MAX_IP = 64;

function allowedOrigin(origin: string): boolean {
  const site = siteUrl();
  return origin === DEV_ORIGIN || (site !== "" && origin === site);
}

function corsHeaders(origin: string | null): Record<string, string> {
  return origin !== null && allowedOrigin(origin)
    ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : { Vary: "Origin" };
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

/**
 * The caller's IP: Convex's request metadata, else the first address in
 * `X-Forwarded-For`. Best effort only: the local backend derives `meta.ip`
 * from a client-supplied `X-Forwarded-For` too, so the global limit is the
 * hard ceiling.
 */
async function callerIp(ctx: ActionCtx, req: Request): Promise<string | null> {
  const meta = await ctx.meta.getRequestMetadata().catch(() => null);
  const ip =
    meta?.ip ?? req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  // Bounded: it becomes part of a rate-limit key.
  return ip ? ip.slice(0, MAX_IP) : null;
}

const START_ERROR_STATUS = {
  invalid_name: 400,
  rate_limited: 429,
  maintenance: 503,
  whatsapp_not_configured: 503,
} as const;

http.route({
  path: "/api/verification/start",
  method: "OPTIONS",
  handler: httpAction(async (_ctx, req) => {
    const origin = req.headers.get("Origin");
    if (origin === null || !allowedOrigin(origin)) {
      return new Response(null, { status: 403, headers: corsHeaders(null) });
    }
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }),
});

http.route({
  path: "/api/verification/start",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const origin = req.headers.get("Origin");
    if (origin !== null && !allowedOrigin(origin)) {
      return json(403, { error: "forbidden_origin" }, corsHeaders(null));
    }
    const headers = corsHeaders(origin);

    const raw = await req.text();
    let body: unknown;
    try {
      body = raw.length <= MAX_START_BODY ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    const { displayName, clientKey } = (body ?? {}) as Record<string, unknown>;
    if (
      typeof displayName !== "string" ||
      typeof clientKey !== "string" ||
      displayName.length > MAX_DISPLAY_NAME_INPUT ||
      clientKey.length === 0 ||
      clientKey.length > MAX_CLIENT_KEY
    ) {
      return json(400, { error: "bad_request" }, headers);
    }

    const res = await ctx.runAction(internal.verification.startInternal, {
      displayName,
      clientKey,
      ip: await callerIp(ctx, req),
    });
    if ("error" in res) {
      return json(START_ERROR_STATUS[res.error], { error: res.error }, headers);
    }
    return json(200, res, headers);
  }),
});

// ---------------------------------------------------------------------------
// WhatsApp Cloud API webhook

http.route({
  path: "/whatsapp/webhook",
  method: "GET",
  handler: httpAction(async (_ctx, req) => {
    const params = new URL(req.url).searchParams;
    const expected = env("WHATSAPP_VERIFY_TOKEN");
    const token = params.get("hub.verify_token");
    const challenge = params.get("hub.challenge");
    if (
      params.get("hub.mode") !== "subscribe" ||
      expected === undefined ||
      token === null ||
      challenge === null ||
      !timingSafeEqual(token, expected)
    ) {
      return new Response("forbidden", { status: 403 });
    }
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }),
});

http.route({
  path: "/whatsapp/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = env("WHATSAPP_APP_SECRET");
    const signature = req.headers.get("X-Hub-Signature-256");
    // Read the raw body exactly once: the signature covers these bytes.
    const raw = await req.text();
    if (secret === undefined) {
      console.error("whatsapp webhook: WHATSAPP_APP_SECRET is not set");
      return new Response(null, { status: 401 });
    }
    const expected = `sha256=${await hmacSha256Hex(secret, raw)}`;
    if (signature === null || !timingSafeEqual(signature, expected)) {
      return new Response(null, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      // Signed but unparseable: acknowledge so Meta doesn't retry it forever.
      console.error("whatsapp webhook: signed body is not JSON");
      return new Response(null, { status: 200 });
    }
    for (const message of parseIncoming(payload)) {
      await ctx.scheduler.runAfter(
        0,
        internal.whatsapp.handleIncoming,
        message,
      );
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
