import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureScreen } from "./captureScreen";

const m = vi.hoisted(() => ({ domToBlob: vi.fn() }));
vi.mock("modern-screenshot", () => ({ domToBlob: m.domToBlob }));

const MB = 1024 * 1024;
const blob = (bytes: number) =>
  new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });

beforeEach(() => {
  m.domToBlob.mockReset();
});

describe("captureScreen", () => {
  it("returns the first picture under 2 MB, as JPEG", async () => {
    m.domToBlob.mockResolvedValue(blob(500_000));
    const result = await captureScreen();
    expect(result?.size).toBe(500_000);
    expect(m.domToBlob).toHaveBeenCalledTimes(1);
    expect(m.domToBlob.mock.calls[0]?.[1]).toMatchObject({
      type: "image/jpeg",
      quality: 0.7,
    });
  });

  it("tries smaller pictures when the first is too big", async () => {
    m.domToBlob
      .mockResolvedValueOnce(blob(3 * MB))
      .mockResolvedValueOnce(blob(2.5 * MB))
      .mockResolvedValueOnce(blob(MB));
    const result = await captureScreen();
    expect(result?.size).toBe(MB);
    expect(m.domToBlob.mock.calls[1]?.[1]).toMatchObject({ quality: 0.5 });
    const firstScale = m.domToBlob.mock.calls[0]?.[1].scale as number;
    expect(m.domToBlob.mock.calls[2]?.[1].scale).toBe(firstScale / 2);
  });

  it("gives up quietly when it can't make one", async () => {
    m.domToBlob.mockRejectedValue(new Error("canvas tainted"));
    expect(await captureScreen()).toBeNull();
    m.domToBlob.mockReset().mockResolvedValue(blob(3 * MB));
    expect(await captureScreen()).toBeNull();
  });
});
