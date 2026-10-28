import { api } from "@convex/_generated/api";
import { convexHttp } from "./convexHttp";
import { readStored, writeStored } from "./session";

const ASKED_KEY = "wirdak.pushAsked";
const OFF_KEY = "wirdak.pushOff";
const WORKER_URL = "/sw.js";

type Nav = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  standalone?: boolean;
};

/** The home-screen app on iOS, or any installed PWA window. */
export function isStandalone(
  win: Window = window,
  nav: Nav = navigator,
): boolean {
  return (
    nav.standalone === true ||
    win.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

export function isIos(nav: Nav = navigator): boolean {
  // iPadOS Safari reports a desktop (Macintosh) user agent, but only it has a touch screen.
  return (
    /iPhone|iPad|iPod/.test(nav.userAgent) ||
    (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
  );
}

/**
 * "ready": this browser can push now. "ios_install": an iPhone or iPad tab, where push only works
 * once the site is on the home screen. "unsupported": no service worker or PushManager.
 */
export function pushSupport(
  nav: Nav = navigator,
  win: Window = window,
): "ready" | "ios_install" | "unsupported" {
  if (isIos(nav) && !isStandalone(win, nav)) return "ios_install";
  const hasWorker = Boolean((nav as Partial<Navigator>).serviceWorker);
  const hasPush = "PushManager" in win && Boolean(win.PushManager);
  if (!hasWorker || !hasPush) return "unsupported";
  return "ready";
}

/** The person turned notifications off on this device, so loads must not quietly resubscribe. */
function pushOff(): boolean {
  return readStored(OFF_KEY) === "1";
}

/** The browser's own permission is "denied": only its settings can change that. */
export function pushBlocked(): boolean {
  return "Notification" in window && Notification.permission === "denied";
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ready") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** This browser's push endpoint, or null when it has no subscription. */
export async function currentEndpoint(): Promise<string | null> {
  return (await currentSubscription())?.endpoint ?? null;
}

/**
 * Turns notifications off on this device: ends the browser's subscription and remembers the
 * choice. Returns the endpoint that was dropped, for the server to forget, or null if none.
 */
export async function dropSubscription(): Promise<string | null> {
  const sub = await currentSubscription();
  writeStored(OFF_KEY, "1");
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

export function pushAsked(): boolean {
  return readStored(ASKED_KEY) === "1";
}

export function markPushAsked(): void {
  writeStored(ASKED_KEY, "1");
}

/** The VAPID public key (URL-safe base64) as the bytes `subscribe` wants. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null | undefined, key: string) {
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(key);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(WORKER_URL);
  return navigator.serviceWorker.ready;
}

async function subscribeAndStore(
  reg: ServiceWorkerRegistration,
  key: string,
  sessionToken: string,
): Promise<void> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    // The server's key rotated; the old subscription can never receive our pushes again.
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(key),
  });
  const { endpoint, keys } = sub.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) return;
  await convexHttp().mutation(api.push.subscribe, {
    sessionToken,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  });
}

/**
 * Asks for permission and subscribes this browser. Call it straight from a tap: browsers (iOS
 * above all) only show the permission dialog for a user gesture, so nothing is awaited before it.
 */
export async function enablePush(
  sessionToken: string,
): Promise<"granted" | "denied" | "unsupported"> {
  if (
    pushSupport() !== "ready" ||
    !("Notification" in window) ||
    typeof Notification.requestPermission !== "function"
  ) {
    return "unsupported";
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  writeStored(OFF_KEY, "0");
  const key = await convexHttp().query(api.push.publicKey, {});
  if (!key) return "unsupported";
  await subscribeAndStore(await registration(), key, sessionToken);
  return "granted";
}

/**
 * On load, for a signed-in person who already allowed notifications: make sure this browser has
 * a live subscription for the server's current key and that the server knows it. A browser
 * renewal (`pushsubscriptionchange`) or a key rotation would otherwise end push silently.
 * Best effort: a failure here just means the next load tries again.
 */
export async function syncPush(sessionToken: string): Promise<void> {
  try {
    if (
      pushSupport() !== "ready" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      pushOff()
    ) {
      return;
    }
    const key = await convexHttp().query(api.push.publicKey, {});
    if (!key) return;
    await subscribeAndStore(await registration(), key, sessionToken);
  } catch {
    // retried on the next load
  }
}
