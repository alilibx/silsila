import { ConvexError } from "convex/values";

/** The `code` of a `ConvexError({ code })`, or `null` for anything else (a network failure, say). */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data === "object" && data !== null && "code" in data) {
    return typeof data.code === "string" ? data.code : null;
  }
  return null;
}
