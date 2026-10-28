import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Help request files (plan 3 spec 3.2 and 3.6). */
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png"];
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const VOICE_TYPES = [
  "audio/mp4",
  "audio/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/aac",
];
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 120;

/**
 * True when an uploaded file may be attached as `kind`: an allowed type (codec
 * parameters ignored), within the size limit, and not attached anywhere yet.
 * A refused file is deleted at once, so it never lingers in storage.
 */
export async function checkFile(
  ctx: MutationCtx,
  id: Id<"_storage">,
  kind: "screenshot" | "voice",
): Promise<boolean> {
  const file = await ctx.db.system.get(id);
  if (!file) return false;
  const type = (file.contentType ?? "").split(";")[0]?.trim().toLowerCase();
  const [types, max] =
    kind === "screenshot"
      ? [SCREENSHOT_TYPES, SCREENSHOT_MAX_BYTES]
      : [VOICE_TYPES, VOICE_MAX_BYTES];
  const used =
    (await ctx.db
      .query("helpMessages")
      .withIndex("by_screenshot", (q) => q.eq("screenshotId", id))
      .first()) ??
    (await ctx.db
      .query("helpMessages")
      .withIndex("by_voice", (q) => q.eq("voiceId", id))
      .first());
  // A file already in a message is someone's; refuse it without deleting it.
  if (used) return false;
  if (type !== undefined && types.includes(type) && file.size <= max) {
    return true;
  }
  await ctx.storage.delete(id);
  return false;
}
