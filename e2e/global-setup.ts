import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = new URL("..", import.meta.url).pathname;

/** What the local backend needs to verify numbers without WhatsApp. Public values only. */
const BACKEND_ENV: Record<string, string> = {
  SILSILA_ENV: "dev",
  SITE_URL: "http://localhost:5173",
  WHATSAPP_PUBLIC_NUMBER: "971500000000",
};

/** Any of these would make the backend talk to the real WhatsApp API. */
const REAL_WHATSAPP = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

const convex = (...args: string[]) =>
  run("pnpm", ["exec", "convex", ...args], { cwd: root });

/** Runs after the webServers are up (the backend has pushed its functions). */
export default async function globalSetup(): Promise<void> {
  const { stdout } = await convex("env", "list", "--names-only");
  const present = REAL_WHATSAPP.filter((name) =>
    stdout.split("\n").some((line) => line.trim().startsWith(name)),
  );
  if (present.length > 0) {
    throw new Error(
      `Refusing to run e2e: the local backend has ${present.join(", ")} set, so it would message real phones. ` +
        `Remove them first: pnpm exec convex env remove <NAME>`,
    );
  }
  for (const [name, value] of Object.entries(BACKEND_ENV)) {
    await convex("env", "set", name, value);
  }
}
