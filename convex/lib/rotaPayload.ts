/** What a member's tap on a rota message's button asks for. */
export type RotaAction = "done" | "notYet" | "dua";

export type RotaPayload = {
  action: RotaAction;
  dayId: string;
  participantId: string;
};

const VERSION = "r1";
const ACTIONS: readonly string[] = ["done", "notYet", "dua"];

/**
 * A quick-reply button's payload: `r1|<s or p>|<action>|<dayId>|<participantId>`.
 * `s` marks a message sent from staging (which shares production's number), so
 * production can relay the tap there. Convex IDs never hold `|`.
 */
export function encodePayload(p: RotaPayload, staging: boolean): string {
  return [
    VERSION,
    staging ? "s" : "p",
    p.action,
    p.dayId,
    p.participantId,
  ].join("|");
}

/** The payload `encodePayload` made, or null for anything else. */
export function decodePayload(
  s: string,
): (RotaPayload & { staging: boolean }) | null {
  const parts = s.split("|");
  if (parts.length !== 5) return null;
  const [version, env, action, dayId, participantId] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (version !== VERSION || (env !== "s" && env !== "p")) return null;
  if (!ACTIONS.includes(action) || dayId === "" || participantId === "") {
    return null;
  }
  return {
    action: action as RotaAction,
    dayId,
    participantId,
    staging: env === "s",
  };
}
