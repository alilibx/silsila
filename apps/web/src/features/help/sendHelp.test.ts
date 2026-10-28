import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendHelp } from "./sendHelp";

const m = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("../../lib/convexHttp", () => ({
  convexHttp: () => ({ mutation: m.mutation }),
}));
vi.mock("../../lib/env", () => ({
  convexSiteUrl: () => "https://site.example",
}));

const context = {
  path: "/",
  appVersion: "0.3.0",
  userAgent: "x",
  screen: "1x1",
  timeZone: "Asia/Dubai",
};
const shot = new Blob([new Uint8Array(10)], { type: "image/jpeg" });

beforeEach(() => {
  m.mutation.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 500 })),
  );
});

describe("sendHelp", () => {
  it("still sends the words when the screenshot can't be uploaded", async () => {
    m.mutation.mockImplementation(
      async (_ref: unknown, args: Record<string, unknown>) =>
        "text" in args ? { requestId: "r1" } : { error: "rate_limited" },
    );
    const res = await sendHelp({
      sessionToken: "member",
      text: "مشكلة",
      screenshot: shot,
      voice: null,
      context,
    });
    expect(res).toEqual({ requestId: "r1" });
    const sent = m.mutation.mock.calls.find(
      ([, a]) => "text" in (a as object),
    )?.[1];
    expect(sent).toMatchObject({ text: "مشكلة" });
    expect(sent).not.toHaveProperty("screenshotId");
  });

  it("still sends the words when the screenshot upload itself fails", async () => {
    m.mutation.mockImplementation(
      async (_ref: unknown, args: Record<string, unknown>) =>
        "text" in args ? { requestId: "r1" } : "https://upload.example/u",
    );
    const res = await sendHelp({
      sessionToken: "member",
      text: "مشكلة",
      screenshot: shot,
      voice: null,
      context,
    });
    expect(res).toEqual({ requestId: "r1" });
  });
});
