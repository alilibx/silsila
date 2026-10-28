import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { HelpContext } from "@convex/lib/help";
import { convexHttp } from "../../lib/convexHttp";
import { convexSiteUrl } from "../../lib/env";
import { ensureReporterToken, getReporterToken } from "./reporterToken";

export type HelpErrorCode =
  "rate_limited" | "empty" | "too_long" | "bad_file" | "not_found" | "generic";

type Result = { requestId: string } | { error: HelpErrorCode };

const KNOWN: ReadonlySet<string> = new Set([
  "rate_limited",
  "empty",
  "too_long",
  "bad_file",
  "not_found",
]);

function asError(code: unknown): { error: HelpErrorCode } {
  return {
    error:
      typeof code === "string" && KNOWN.has(code)
        ? (code as HelpErrorCode)
        : "generic",
  };
}

/** What every help request carries without asking (spec 3.3). */
export function helpContext(): HelpContext {
  return {
    path: location.pathname,
    appVersion: __APP_VERSION__,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** The invite code of the khatma page the request was sent from, if any. */
export function inviteCodeFromPath(path: string): string | null {
  return /^\/j\/([^/]+)/.exec(path)?.[1] ?? null;
}

async function upload(url: string, blob: Blob): Promise<Id<"_storage">> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  return ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${convexSiteUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json().catch(() => ({ error: "generic" }));
}

/**
 * Sends one help message: uploads its files, then creates the request or adds
 * to it. Members go through mutations; a visitor's first request goes over
 * HTTP, where the per-IP limit can see the IP (spec 3.5 and 3.6).
 */
export async function sendHelp(args: {
  sessionToken: string | undefined;
  requestId?: string;
  text: string;
  screenshot: Blob | null;
  voice: { blob: Blob; seconds: number } | null;
  context: HelpContext;
}): Promise<Result> {
  const client = convexHttp();
  const requestId = args.requestId as Id<"helpRequests"> | undefined;
  const files = async (getUrl: () => Promise<string | { error: string }>) => {
    const ids: {
      screenshotId?: Id<"_storage">;
      voiceId?: Id<"_storage">;
      voiceSeconds?: number;
    } = {};
    if (args.screenshot) {
      // A screenshot that won't upload is dropped quietly (spec 3.2): the words matter more.
      try {
        const url = await getUrl();
        if (typeof url === "string") {
          ids.screenshotId = await upload(url, args.screenshot);
        }
      } catch {
        // sent without it
      }
    }
    if (args.voice) {
      const url = await getUrl();
      if (typeof url !== "string") throw url;
      ids.voiceId = await upload(url, args.voice.blob);
      ids.voiceSeconds = args.voice.seconds;
    }
    return ids;
  };
  const text = args.text.trim() ? args.text : undefined;

  try {
    if (args.sessionToken) {
      const sessionToken = args.sessionToken;
      const ids = await files(() =>
        client.mutation(api.help.uploadUrl, { sessionToken }),
      );
      const res = await client.mutation(api.help.send, {
        sessionToken,
        requestId,
        inviteCode: inviteCodeFromPath(args.context.path) ?? undefined,
        context: args.context,
        text,
        ...ids,
      });
      return "error" in res ? asError(res.error) : res;
    }

    if (requestId) {
      const reporterToken = getReporterToken();
      if (!reporterToken) return { error: "not_found" };
      const ids = await files(async () => {
        const res = (await postJson("/api/help/upload-url", {
          reporterToken,
          requestId,
        })) as { uploadUrl?: string; error?: string };
        return res.uploadUrl ?? { error: res.error ?? "generic" };
      });
      const res = await client.mutation(api.help.sendAsVisitor, {
        reporterToken,
        requestId,
        text,
        ...ids,
      });
      return "error" in res ? asError(res.error) : res;
    }

    const reporterToken = ensureReporterToken();
    const ids = await files(async () => {
      const res = (await postJson("/api/help/upload-url", {
        reporterToken,
      })) as { uploadUrl?: string; error?: string };
      return res.uploadUrl ?? { error: res.error ?? "generic" };
    });
    const res = (await postJson("/api/help/request", {
      reporterToken,
      inviteCode: inviteCodeFromPath(args.context.path),
      text: text ?? null,
      ...ids,
      context: args.context,
    })) as { requestId?: string; error?: string };
    return res.requestId ? { requestId: res.requestId } : asError(res.error);
  } catch (err) {
    return asError((err as { error?: unknown } | null)?.error);
  }
}
