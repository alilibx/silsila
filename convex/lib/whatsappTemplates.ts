import { toArabicDigits } from "./digits";
import {
  behindPhrase,
  juzList,
  type NoteKind,
  type NoteTextInput,
} from "./noteText";

/** A template send: the header and body texts, and the first button's parameter. */
export type TemplateMessage = {
  name: string;
  header?: string;
  body?: string[];
  buttonParam?: string;
};

/**
 * WhatsApp refuses template parameters with newlines, tabs or more than four
 * spaces in a row, so every run of whitespace becomes one space.
 */
export function cleanParam(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/**
 * The approved utility template for each note kind (Meta's names, `ar`), or
 * null for a kind that never goes to WhatsApp. Each has the khatma title as
 * its header and an "open the khatma" button on `https://wirdak.app/{{1}}`.
 * The bodies are plain updates about the member's own booking, role or
 * khatma, not `noteText`'s wording, which Meta read as marketing. Suffixes
 * count rewordings, because a deleted template's name stays taken.
 */
export const NOTE_TEMPLATES: Record<NoteKind, string | null> = {
  almostUp: "wirdak_almost_up",
  openForHelp: "wirdak_open_for_help_v3",
  thanks: "wirdak_juz_helped",
  reminder: "wirdak_reminder_v2",
  // An invitation to members who hold nothing, which Meta counts as
  // marketing however it's worded: in-app and push only.
  behind: null,
  completed: "wirdak_completed_v2",
  nowOrganizer: "wirdak_now_organizer_v2",
  organizerMoved: "wirdak_organizer_moved_v2",
  // The organizer's rota day notes: in-app and push only.
  rotaUnread: null,
  rotaSummary: null,
};
/** "Open for help" with two or more ajza': Arabic agreement needs its own body. */
export const OPEN_FOR_HELP_MANY = "wirdak_open_for_help_many_v3";

/** A template header holds at most 60 characters. */
const MAX_HEADER = 60;
/** The only site whose button links go through production's `/stg/` redirect. */
const STAGING_SITE = "https://stg.wirdak.app";

// Same wording and date as `t.khatma.untitled` on the web; change both together.
const untitledDate = new Intl.DateTimeFormat("ar", {
  timeZone: "Asia/Dubai",
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** The khatma's title as the app shows it, as one clean header line. */
export function khatmaTitle(k: {
  name: string | null;
  createdAt: number;
}): string {
  const title =
    k.name ?? `ختمة ${toArabicDigits(untitledDate.format(k.createdAt))}`;
  return cleanParam(title).slice(0, MAX_HEADER).trim();
}

/**
 * What follows `https://wirdak.app/` on the button: the khatma page, routed
 * through the `/stg/` redirect when this deployment is staging.
 */
export function buttonSuffix(inviteCode: string, site: string): string {
  return site === STAGING_SITE ? `stg/j/${inviteCode}` : `j/${inviteCode}`;
}

/**
 * The template that carries a note, with its header, body and button values;
 * null for a kind that never goes to WhatsApp.
 */
export function noteTemplate(
  note: NoteTextInput,
  khatma: { name: string | null; createdAt: number; inviteCode: string },
  site: string,
  now: number = Date.now(),
): TemplateMessage | null {
  const many = note.kind === "openForHelp" && note.juz.length > 1;
  const name = many ? OPEN_FOR_HELP_MANY : NOTE_TEMPLATES[note.kind];
  if (name === null) return null;
  return {
    name,
    header: khatmaTitle(khatma),
    body: noteParams(note, now),
    buttonParam: buttonSuffix(khatma.inviteCode, site),
  };
}

function noteParams(note: NoteTextInput, now: number): string[] {
  switch (note.kind) {
    case "almostUp":
    case "openForHelp":
    case "thanks":
    case "reminder":
      return [juzList(note.juz)];
    case "behind":
      return [behindPhrase(note.count ?? 0, note.until, now)];
    // the two rota kinds never reach WhatsApp (`NOTE_TEMPLATES` is null for both)
    case "completed":
    case "nowOrganizer":
    case "organizerMoved":
    case "rotaUnread":
    case "rotaSummary":
      return [];
  }
}
