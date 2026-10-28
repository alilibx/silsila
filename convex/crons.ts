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

// Hourly: delete old help files and conversations, and uploads never attached.
crons.hourly(
  "purge old help files and orphaned uploads",
  { minuteUTC: 45 },
  internal.maintenance.purgeHelpData,
  {},
);

// Hourly: close answered help requests nobody answered back (plan 3 spec 3.4).
crons.hourly(
  "close answered help requests with no word back",
  { minuteUTC: 15 },
  internal.help.autoClose,
  {},
);

// Daily: hand a khatma to an active member when its organizer has been away 30 days.
crons.daily(
  "hand a khatma over when its organizer is away",
  { hourUTC: 3, minuteUTC: 0 },
  internal.organizer.autoHandoverSweep,
  {},
);

// Daily at 00:10 Dubai (20:10 UTC): roll up yesterday's stats, catching up any missed day.
crons.daily(
  "roll up yesterday's stats",
  { hourUTC: 20, minuteUTC: 10 },
  internal.stats.rollupYesterday,
  {},
);

export default crons;
