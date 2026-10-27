import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "purge old rate limits, messages, and verifications",
  { hourUTC: 3, minuteUTC: 0 },
  internal.maintenance.purge,
);

export default crons;
