export type RotaReply = "done" | "notYet" | "stop" | "dua";

const DIACRITICS_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Arabic and Latin text as one comparable form: no diacritics or tatweel,
 * one alef, ة written ه at the end of a word, Latin lowercase, no emoji
 * variation selectors or skin tones or end punctuation, single spaces.
 */
function normalize(s: string): string {
  return s
    .replace(DIACRITICS_AND_TATWEEL, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة(?=\s|$)/g, "ه")
    .toLowerCase()
    .replace(/[.,!?؟،؛:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const normalized = (list: string[]): Set<string> =>
  new Set(list.map(normalize));

const DONE = normalized([
  "تم",
  "تمت",
  "أتممت",
  "اتممت",
  "خلصت",
  "قرأت",
  "قرأته",
  "الحمد لله تم",
  "done",
  "✅",
  "👍",
]);
const NOT_YET = normalized([
  "ليس بعد",
  "بعد",
  "لا بعد",
  "بعدين",
  "لاحقا",
  "مو بعد",
  "not yet",
]);
const STOP = normalized(["إيقاف", "ايقاف", "أوقف", "stop"]);
const DUA = normalized(["دعاء الختم", "الدعاء"]);

/**
 * What a member's typed reply means, or null. The whole text must be one of
 * the phrases; «تم» and «stop» also count as the first word of a longer text
 * («تم الحمد لله»).
 */
export function classifyReply(text: string): RotaReply | null {
  const whole = normalize(text);
  if (whole === "") return null;
  if (DONE.has(whole)) return "done";
  if (NOT_YET.has(whole)) return "notYet";
  if (STOP.has(whole)) return "stop";
  if (DUA.has(whole)) return "dua";
  const first = whole.split(" ")[0]!;
  if (DONE.has(first)) return "done";
  if (STOP.has(first)) return "stop";
  return null;
}
