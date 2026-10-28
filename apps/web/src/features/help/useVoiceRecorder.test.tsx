import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "./useVoiceRecorder";

class FakeRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  static last: FakeRecorder | null = null;
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public options: { mimeType?: string },
  ) {
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] };

beforeEach(() => {
  track.stop.mockReset();
  FakeRecorder.last = null;
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useVoiceRecorder", () => {
  it("isn't supported without MediaRecorder", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.supported).toBe(false);
  });

  it("says denied when the microphone is refused", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () =>
          Promise.reject(new Error("NotAllowed")),
        ),
      },
    });
    const { result } = renderHook(() => useVoiceRecorder());
    await act(() => result.current.start());
    expect(result.current.state).toBe("denied");
  });

  it("records with a supported type and stops by itself at 2 minutes", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(() => result.current.start());
    expect(result.current.state).toBe("recording");
    expect(FakeRecorder.last?.options.mimeType).toBe("audio/webm;codecs=opus");

    act(() => void vi.advanceTimersByTime(120_000));
    expect(result.current.state).toBe("done");
    expect(result.current.seconds).toBe(120);
    expect(result.current.blob).not.toBeNull();
    expect(track.stop).toHaveBeenCalled();
  });

  it("can be stopped early and thrown away", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(() => result.current.start());
    act(() => void vi.advanceTimersByTime(5_000));
    act(() => result.current.stop());
    expect(result.current.seconds).toBe(5);
    act(() => result.current.discard());
    expect(result.current.state).toBe("idle");
    expect(result.current.blob).toBeNull();
  });

  it("releases the microphone when the component goes away", async () => {
    const { result, unmount } = renderHook(() => useVoiceRecorder());
    await act(() => result.current.start());
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });
});
