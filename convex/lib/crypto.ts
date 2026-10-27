// Web Crypto only: runs in Convex's V8 runtime and in browsers. Never use these
// generators from queries or mutations (Convex seeds randomness there); call them
// from actions or HTTP actions.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const encoder = new TextEncoder();

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // getRandomValues is limited to 65536 bytes per call.
  for (let i = 0; i < n; i += 65_536) {
    crypto.getRandomValues(out.subarray(i, Math.min(i + 65_536, n)));
  }
  return out;
}

/** Random string of `len` symbols from CODE_ALPHABET, using rejection sampling (no modulo bias). */
export function randomCode(len: number): string {
  const size = CODE_ALPHABET.length;
  const limit = 256 - (256 % size);
  let out = "";
  while (out.length < len) {
    for (const b of randomBytes(Math.max(16, (len - out.length) * 2))) {
      if (b >= limit) continue;
      out += CODE_ALPHABET[b % size];
      if (out.length === len) break;
    }
  }
  return out;
}

/** `K7Q29XMB4T` becomes `K7Q2-9XMB-4T`. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

/** Uppercases and drops everything that is not in CODE_ALPHABET. */
export function normalizeCode(s: string): string {
  let out = "";
  for (const ch of s.toUpperCase()) {
    if (CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out;
}

/** `bytes` random bytes as unpadded base64url. */
export function randomToken(bytes: number): string {
  let bin = "";
  for (const b of randomBytes(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Six random decimal digits (leading zeros kept), uniformly distributed. */
export function randomPin(): string {
  const limit = 4_294_000_000; // largest multiple of 1_000_000 that fits in 2^32
  for (;;) {
    const n = new DataView(randomBytes(4).buffer).getUint32(0);
    if (n < limit) return String(n % 1_000_000).padStart(6, "0");
  }
}

function toHex(buf: ArrayBuffer): string {
  let out = "";
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
}

export async function hmacSha256Hex(
  key: string,
  body: string,
): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", k, encoder.encode(body)));
}

/** Compares over the longer length without short-circuiting; unequal lengths are never equal. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
