import { useCallback, useEffect, useRef, useState } from "react";

/** Voice notes stop by themselves at 2 minutes (plan 3 spec 3.2). */
export const MAX_VOICE_SECONDS = 120;
const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

export type VoiceState = "idle" | "recording" | "done" | "denied";

function recorderSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

function pickType(): string | undefined {
  return TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
}

/** Records one voice note with the microphone. Hidden by callers when unsupported or denied. */
export function useVoiceRecorder() {
  const [supported] = useState(recorderSupported);
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const release = useCallback(() => {
    if (ticker.current !== null) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || state === "recording") return;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      setState("denied");
      return;
    }
    const type = pickType();
    const rec = new MediaRecorder(
      stream.current,
      type ? { mimeType: type } : undefined,
    );
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      release();
      setBlob(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }));
      setState("done");
    };
    recorder.current = rec;
    setSeconds(0);
    setBlob(null);
    rec.start();
    setState("recording");
    let elapsed = 0;
    ticker.current = setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      if (elapsed >= MAX_VOICE_SECONDS) stop();
    }, 1000);
  }, [supported, state, release, stop]);

  const discard = useCallback(() => {
    setBlob(null);
    setSeconds(0);
    setState("idle");
  }, []);

  // The microphone is released when the sheet goes away mid-recording.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    },
    [release],
  );

  return { supported, state, seconds, blob, start, stop, discard };
}
