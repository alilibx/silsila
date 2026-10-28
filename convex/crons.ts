import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly so short-lived (possibly IP-keyed) rate-limit windows don't linger.
crons.hourly(
  "purge expired rate limits, old messages, and verifications",
  { minuteUTC: 0 },
  internal.maintenance.purge,
);

// Hourly: invite free members to a round that can't make its target end.
crons.hourly(
  "invite free members to a round that is behind",
  { minuteUTC: 30 },
  internal.nudges.behindSweep,
  {},
);

// Daily: hand a khatma to an active member when its organizer has been away 30 days.
crons.daily(
  "hand a khatma over when its organizer is away",
  { hourUTC: 3, minuteUTC: 0 },
  internal.organizer.autoHandoverSweep,
  {},
);

export default crons;
