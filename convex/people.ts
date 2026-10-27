import { ConvexError, v } from "convex/values";
import { cleanDisplayName } from "./lib/text";
import { requirePerson, sessionMutation } from "./lib/session";

export const updateDisplayName = sessionMutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const person = requirePerson(ctx);
    const displayName = cleanDisplayName(args.displayName);
    if (displayName === null) throw new ConvexError({ code: "invalid_name" });
    await ctx.db.patch(person._id, { displayName });
  },
});
