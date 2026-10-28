import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | undefined;

/**
 * A one-shot Convex client for code that runs outside React (push registration, the hand-off
 * exchange). It carries no auth of its own: every call passes its session token as an argument.
 */
export function convexHttp(): ConvexHttpClient {
  client ??= new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL);
  return client;
}
