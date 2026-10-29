export type RotaReply = "done" | "notYet" | "stop" | "dua";

const DIACRITICS_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Arabic and Latin text as one comparable form: no diacritics or tatweel,
 * one alef, Latin lowercase, no emoji variation selectors or skin tones,
 * punctuation as spaces (before ة is written ه at the end of a word), single
 * spaces.
 */
function normalize(s: string): string {
  return s
    .replace(DIACRITICS_AND_TATWEEL, "")
    .replace(/\uFE0F/g, "")
    .replace(/\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}/gu, "")
    .toLowerCase()
    .replace(/[.,!?؟،؛:]+/g, " ")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة(?=\s|$)/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

const normalized = (list: string[]): Set<string> =>
  new Set(list.map(normalize));

const DONE = normalized([
  "تم",
  "تمت",
  "تم الحمد لله",
  "تم بحمد الله",
  "تم والحمد لله",
  "قرأت الحمد لله",
  "تم ✅",
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
 * the phrases, so «تم نقل الموعد» is no «done». Only «stop» also counts as the
 * first word of a longer text, because stopping errs on the safe side.
 */
export function classifyReply(text: string): RotaReply | null {
  const whole = normalize(text);
  if (whole === "") return null;
  if (DONE.has(whole)) return "done";
  if (NOT_YET.has(whole)) return "notYet";
  if (STOP.has(whole)) return "stop";
  if (DUA.has(whole)) return "dua";
  const first = whole.split(" ")[0]!;
  if (STOP.has(first)) return "stop";
  return null;
}
