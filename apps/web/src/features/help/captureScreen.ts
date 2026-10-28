import { domToBlob } from "modern-screenshot";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_WIDTH = 1280;

/**
 * A picture of the page as it looks now, for a help request (plan 3 spec 3.2).
 * A website can't take a real screenshot, so the page draws itself. Smaller
 * tries follow until it fits under 2 MB; any failure means no picture.
 */
export async function captureScreen(): Promise<Blob | null> {
  const scale = Math.min(1, MAX_WIDTH / Math.max(1, window.innerWidth));
  const tries = [
    { quality: 0.7, scale },
    { quality: 0.5, scale },
    { quality: 0.5, scale: scale / 2 },
  ];
  try {
    for (const t of tries) {
      const blob = await domToBlob(document.body, {
        type: "image/jpeg",
        quality: t.quality,
        scale: t.scale,
      });
      if (blob.size <= MAX_BYTES) return blob;
    }
  } catch {
    // no picture; the sheet still opens
  }
  return null;
}
