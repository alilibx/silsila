import { DUAS } from "./duas";
import { toArabicDigits } from "./digits";
import { juzPhrase, juzPhraseGenitive } from "./noteText";
import { khatmaTitle, type TemplateMessage } from "./whatsappTemplates";

/**
 * What a rota member's WhatsApp sees: the approved templates for messages
 * Wirdak starts, and the free-form texts for replies inside the 24-hour
 * window. The templates are plain UTILITY status updates, because Meta read
 * every prayer, question and invitation as marketing. The dua goes out only
 * behind the «دعاء الختم» button or as free-form text, never in a template.
 */

/** The labels of the quick-reply buttons, which free-form messages repeat as reply buttons. */
export const ROTA_BUTTONS = {
  done: "أتممت",
  notYet: "ليس بعد",
  dua: "دعاء الختم",
} as const;

export const ROTA_JUZ = "wirdak_rota_juz";
export const ROTA_REMINDER = "wirdak_rota_reminder";
export const ROTA_ASSIGNED = "wirdak_rota_assigned";
export const ROTA_COVERED = "wirdak_rota_covered";
export const ROTA_COMPLETE = "wirdak_rota_complete";
export const ROTA_CYCLE = "wirdak_rota_cycle";

type Khatma = { name: string | null; createdAt: number };
/** The payloads of the «أتممت» and «ليس بعد» buttons, in button order. */
type DonePayloads = { done: string; notYet: string };

/** The member's juz' of the day, with the done and not-yet buttons. */
export function juzTemplate(
  khatma: Khatma,
  juz: number[],
  number: number,
  payloads: DonePayloads,
): TemplateMessage {
  return {
    name: ROTA_JUZ,
    header: khatmaTitle(khatma),
    body: [toArabicDigits(number), juzPhrase(juz)],
    quickReplies: [payloads.done, payloads.notYet],
  };
}

/** The same day's reminder, when the juz' isn't recorded yet. */
export function reminderTemplate(
  khatma: Khatma,
  juz: number[],
  payloads: DonePayloads,
): TemplateMessage {
  return {
    name: ROTA_REMINDER,
    header: khatmaTitle(khatma),
    body: [juzPhraseGenitive(juz)],
    quickReplies: [payloads.done, payloads.notYet],
  };
}

/** A juz' handed to the member after the day began (someone else dropped it). */
export function assignedTemplate(
  khatma: Khatma,
  juz: number[],
  number: number,
  payloads: DonePayloads,
): TemplateMessage {
  return {
    name: ROTA_ASSIGNED,
    header: khatmaTitle(khatma),
    body: [juzPhraseGenitive(juz), toArabicDigits(number)],
    quickReplies: [payloads.done, payloads.notYet],
  };
}

/** The member's juz' was read by someone else, so it's no longer theirs. */
export function coveredTemplate(
  khatma: Khatma,
  juz: number[],
): TemplateMessage {
  return {
    name: ROTA_COVERED,
    header: khatmaTitle(khatma),
    body: [juzPhraseGenitive(juz)],
  };
}

/** All thirty ajza' of khatma `number` are read; the button asks for the dua. */
export function completeTemplate(
  khatma: Khatma,
  number: number,
  duaPayload: string,
): TemplateMessage {
  return {
    name: ROTA_COMPLETE,
    header: khatmaTitle(khatma),
    body: [toArabicDigits(number)],
    quickReplies: [duaPayload],
  };
}

/** The member read thirty ajza' in thirty khatmas, the whole Quran. */
export function cycleTemplate(khatma: Khatma): TemplateMessage {
  return {
    name: ROTA_CYCLE,
    header: khatmaTitle(khatma),
    body: [],
  };
}

/**
 * The free-form versions of the templates, for messages inside the 24-hour
 * window. Each repeats its template's body word for word, so a member reads
 * the same message in or out of the window.
 */
export function reminderText(juz: number[]): string {
  return `تذكير بقراءتك اليوم: لم تُسجَّل بعد قراءة ${juzPhraseGenitive(juz)}.`;
}

export function assignedText(juz: number[], number: number): string {
  return `تحديث على قراءتك: أُسندت إليك اليوم قراءة ${juzPhraseGenitive(juz)} في الختمة ${toArabicDigits(number)}.`;
}

export function completeText(number: number): string {
  return `تحديث على الختمة: اكتملت قراءة الأجزاء الثلاثين في الختمة ${toArabicDigits(number)}.`;
}

export function coveredText(juz: number[]): string {
  return `تحديث على قراءتك: تمّت اليوم قراءة ${juzPhraseGenitive(juz)} عنك، فلم يعد عليك شيء منها.`;
}

export const cycleText =
  "تحديث على قراءتك: أكملت ثلاثين جزءاً في ثلاثين ختمة، أي القرآن كاملاً.";

/**
 * The reply to the member's join message. `next` holds the weekday and the
 * time of their next juz' message, already formatted, or null with no day
 * ahead to promise.
 */
export function welcomeText(
  name: string,
  title: string,
  next: { weekday: string; time: string } | null,
): string {
  const joined = `أهلاً ${name}، انضممت إلى ${title}.`;
  if (next === null) return joined;
  return `${joined} تصلك رسالة جزئك يوم ${next.weekday} الساعة ${next.time}.`;
}

/** The juz' message as free-form text; the done and not-yet buttons go with it. */
export function juzText(number: number, juz: number[]): string {
  return `الختمة ${toArabicDigits(number)} اليوم. قراءتك: ${juzPhrase(juz)}.`;
}

export function thanksText(doneCount: number): string {
  return `تقبّل الله منك. ${toArabicDigits(doneCount)} من ٣٠ جزءاً تمّت اليوم.`;
}

/** `reminderTime` is the already formatted time of the day's reminder, or null with none. */
export function notYetText(reminderTime: string | null): string {
  return reminderTime === null
    ? "لا بأس."
    : `لا بأس، نذكّرك الساعة ${reminderTime}.`;
}

export const alreadyText = "سجّلنا قراءتك من قبل.";
export const closedText = "انتهى يوم هذه الختمة.";
export const notOnListText = "أرسلنا طلبك إلى منظّم الختمة، ونخبرك حين يضيفك.";
export const stopText =
  "أوقفنا رسائل الختمة لك. لتعود إليها أرسل رسالة الانضمام مرة أخرى.";
export const helpText = "اضغط «أتممت» أو «ليس بعد» في رسالة جزئك.";
export const whichKhatmaText = "لأي ختمة؟";

/** Both duas of the khatm, each followed by its reference. */
export function duaText(): string {
  return DUAS.map((d) => `${d.text}\n(${d.ref})`).join("\n\n");
}
