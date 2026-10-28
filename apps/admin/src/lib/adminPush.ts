import { api } from "@convex/_generated/api";
import { convexHttp } from "@web/lib/convexHttp";
import { keyBytes, pushBlocked, pushSupport } from "@web/lib/push";

/** The admin app's own worker (apps/admin/public/sw.js). */
const WORKER_URL = "/sw.js";

/** Same rules as the website: an iPhone tab needs the home-screen app first. */
export const adminPushSupport = pushSupport;

async function subscription(): Promise<PushSubscription | null> {
  if (adminPushSupport() !== "ready") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function currentAdminEndpoint(): Promise<string | null> {
  return (await subscription())?.endpoint ?? null;
}

/** Subscribes this device to the admin's help pushes (spec 7). */
export async function enableAdminPush(
  adminToken: string,
): Promise<"on" | "denied" | "failed"> {
  if (adminPushSupport() !== "ready") return "failed";
  if (pushBlocked()) return "denied";
  try {
    const key = await convexHttp().query(api.push.publicKey, {});
    if (!key) return "failed";
    if ((await Notification.requestPermission()) !== "granted") {
      return "denied";
    }
    await navigator.serviceWorker.register(WORKER_URL);
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(key),
      }));
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
      return "failed";
    await convexHttp().mutation(api.adminPush.subscribe, {
      adminToken,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
    return "on";
  } catch {
    return "failed";
  }
}

/** Stops pushes to this device and tells the server to forget it. */
export async function disableAdminPush(adminToken: string): Promise<void> {
  const sub = await subscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await convexHttp()
    .mutation(api.adminPush.unsubscribe, { adminToken, endpoint })
    .catch(() => undefined);
}
