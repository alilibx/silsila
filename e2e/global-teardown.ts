import { convex, IP_LIMIT_SETTING } from "./global-setup";

/** Runs before the webServers stop: puts the per-IP verification limit back to its default. */
export default async function globalTeardown(): Promise<void> {
  await convex(
    "run",
    "dev:setSetting",
    JSON.stringify({ key: IP_LIMIT_SETTING, value: null }),
  );
}
