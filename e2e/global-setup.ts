import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

/** What the local backend needs to verify numbers without WhatsApp. Public values only. */
const BACKEND_ENV: Record<string, string> = {
  WIRDAK_ENV: "dev",
  SITE_URL: "http://localhost:5173",
  WHATSAPP_PUBLIC_NUMBER: "971500000000",
};

/**
 * Every test verifies from the same address, so the per-IP limit on starting a verification
 * (30 per 10 minutes) would stop a full run part-way. The run lifts it and puts back whatever
 * was stored before. A run killed part-way leaves it lifted; the next full run restores it.
 */
const IP_LIMIT_SETTING = "verifyStartPerIpPer10Min";
const IP_LIMIT_FOR_RUN = 10_000;

/** Stores `value` for the per-IP limit (null: the default) and returns what was stored before. */
async function setIpLimit(value: number | null): Promise<number | null> {
  const { stdout } = await convex(
    "run",
    "dev:setSetting",
    JSON.stringify({ key: IP_LIMIT_SETTING, value }),
  );
  // The CLI prints the return value as JSON on its last line.
  const last = stdout.trim().split("\n").at(-1) || "null";
  return JSON.parse(last) as number | null;
}

/** Any of these would make the backend talk to the real WhatsApp API. */
const REAL_WHATSAPP = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

const convex = (...args: string[]) =>
  run("bun", ["run", "convex", ...args], { cwd: root });

/**
 * Runs after the webServers are up (the backend has pushed its functions). The function it
 * returns is the global teardown, which runs before they stop.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const { stdout } = await convex("env", "list", "--names-only");
  const present = REAL_WHATSAPP.filter((name) =>
    stdout.split("\n").some((line) => line.trim().startsWith(name)),
  );
  if (present.length > 0) {
    throw new Error(
      `Refusing to run e2e: the local backend has ${present.join(", ")} set, so it would message real phones. ` +
        `Remove them first: bun run convex env remove <NAME>`,
    );
  }
  for (const [name, value] of Object.entries(BACKEND_ENV)) {
    await convex("env", "set", name, value);
  }
  const before = await setIpLimit(IP_LIMIT_FOR_RUN);
  // A killed run left its own value behind: the default is what it replaced.
  const restore = before === IP_LIMIT_FOR_RUN ? null : before;
  return async () => {
    await setIpLimit(restore);
  };
}
