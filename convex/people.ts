import { ConvexError, v } from "convex/values";
import { checkRateLimit } from "./lib/rateLimit";
import { requirePerson, sessionMutation } from "./lib/session";
import { getSetting } from "./lib/settings";
import { cleanDisplayName } from "./lib/text";

const HOUR_MS = 3_600_000;

export const updateDisplayName = sessionMutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const person = requirePerson(ctx);
    if (await getSetting(ctx, "maintenanceMode")) {
      throw new ConvexError({ code: "maintenance" });
    }
    const displayName = cleanDisplayName(args.displayName);
    if (displayName === null) throw new ConvexError({ code: "invalid_name" });
    // after validation, so a refused name does not spend a change
    const allowed = await checkRateLimit(
      ctx,
      `name:${person._id}`,
      await getSetting(ctx, "nameChangesPerPersonPerHour"),
      HOUR_MS,
    );
    if (!allowed) throw new ConvexError({ code: "rate_limited" });
    await ctx.db.patch(person._id, { displayName });
  },
});
