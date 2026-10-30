import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..");

describe("privacy policy", () => {
  // Meta's app review reads this URL, so it must serve the static page, not the SPA fallback.
  it("/privacy is rewritten to the static page before the SPA catch-all", () => {
    const config = JSON.parse(
      readFileSync(join(WEB, "vercel.json"), "utf8"),
    ) as { rewrites: { source: string; destination: string }[] };
    const sources = config.rewrites.map((r) => r.source);
    const privacy = sources.indexOf("/privacy");
    expect(privacy).toBeGreaterThanOrEqual(0);
    expect(config.rewrites[privacy]?.destination).toBe("/privacy.html");
    expect(privacy).toBeLessThan(sources.indexOf("/(.*)"));
  });

  it("the page is readable without JavaScript, in Arabic and English", () => {
    const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('id="en" lang="en" dir="ltr"');
    expect(html).toContain("support@manzilo.com");
  });
});

/** The text between a heading and the next one. */
function section(html: string, heading: string): string {
  const start = html.indexOf(`<h2>${heading}</h2>`);
  if (start < 0) return "";
  const end = html.indexOf("<h2>", start + 1);
  return html.slice(start, end < 0 ? undefined : end);
}

describe("privacy policy: help requests", () => {
  const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");

  it("explains help requests in Arabic, with their own retention", () => {
    const ar = section(html, "طلبات المساعدة");
    expect(ar).not.toBe("");
    for (const words of ["صورة الشاشة", "تسجيل صوتي", "٣٠ يوماً", "١٨٠ يوماً"]) {
      expect(ar).toContain(words);
    }
  });

  it("explains help requests in English too", () => {
    const en = section(html, "Help requests");
    expect(en).not.toBe("");
    for (const words of ["screenshot", "voice note", "30 days", "180 days"]) {
      expect(en).toContain(words);
    }
  });
});

describe("privacy policy: rotating khatma messages", () => {
  const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");

  it("explains in Arabic that members are messaged only after they join, and how to stop", () => {
    const ar = section(html, "واتساب").replace(/\s+/g, " ");
    for (const words of [
      "رقم واتساب",
      "رسالة الانضمام",
      "رسالة جزئه",
      "تذكيراً به",
      "يُسند إليه جزء غيره",
      "يُقرأ جزؤه عنه",
      "رسالة الختم ومعها الدعاء",
      "ملاحظة نهاية الدورة",
      "أرقام الأجزاء أو رقم الختمة",
      "لا تحمل ملاحظة نهاية الدورة إلا اسم الختمة",
      "اسم المشارك كما أدخله",
      "اسم ملفه في واتساب",
      "«مشارك جديد»",
      "وقت آخر رسالة وصلتنا من كل رقم",
      "هل انقطع المشارك عن الردّ",
      "طلب انضمام",
      "رأى المنظّم رقمه كاملاً",
      "إيقاف",
      "Meta",
    ]) {
      expect(ar).toContain(words);
    }
  });

  it("explains it in English too", () => {
    const en = section(html, "WhatsApp").replace(/\s+/g, " ");
    for (const words of [
      "rotating khatma",
      "join message",
      "juz' message on each reading day",
      "a reminder about it",
      "someone else's juz' is given to them",
      "their juz' was read for them",
      "completion message with the dua",
      "end-of-cycle note",
      "juz' numbers or the khatma's number",
      "end-of-cycle note carries only the khatma's name",
      "participant's name as the organizer entered it",
      "WhatsApp profile name",
      "new participant",
      "when each number in a rotating khatma last wrote to us",
      "whether a participant has stopped replying",
      "join request",
      "the organizer sees their full number",
      "إيقاف",
      "Meta receives",
    ]) {
      expect(en).toContain(words);
    }
  });
});

describe("privacy policy: rotating khatma disclosures", () => {
  const html = readFileSync(join(WEB, "public", "privacy.html"), "utf8");
  const flat = (heading: string) =>
    section(html, heading).replace(/\s+/g, " ");

  it("says who sees phone numbers, with the rotating khatma exception", () => {
    const ar = flat("من يرى بياناتك");
    for (const words of [
      "إلا في الختمة بالتناوب",
      "الأرقام التي أدخلها بنفسه",
      "الرقم كاملاً لكل من قبله من طلب انضمام",
      "ويرى مشرفو وِردك هذه الأرقام حين يساعدونك",
    ]) {
      expect(ar).toContain(words);
    }
    const en = flat("Who sees your data");
    for (const words of [
      "The exception is a rotating khatma",
      "the numbers they entered themselves",
      "the full number of anyone they accepted from a join request",
      "Wirdak's admins can see these numbers when they help you",
    ]) {
      expect(en).toContain(words);
    }
  });

  it("lists the rotating khatma messages Meta delivers", () => {
    const ar = flat("مزوّدو الخدمة");
    expect(ar).toContain(
      "ورسائل الختمة بالتناوب: الجزء والتذكير وإعادة الإسناد والختم والدعاء وردودنا",
    );
    const en = flat("Service providers");
    expect(en).toContain(
      "delivering the rotating khatma messages: the juz', reminders, reassignment and completion messages, the dua, and our replies",
    );
  });

  it("says who the last-message record covers and how long it is kept", () => {
    const ar = flat("واتساب");
    for (const words of [
      "ومن كل رقم له طلب انضمام معلّق",
      "يوماً واحداً على الأكثر",
      "حتى بعد إزالته منها، إلى أن تُحذف الختمة",
    ]) {
      expect(ar).toContain(words);
    }
    const en = flat("WhatsApp");
    for (const words of [
      "each number with a pending join request",
      "for at most a day",
      "even after they are removed, until the khatma is deleted",
    ]) {
      expect(en).toContain(words);
    }
  });
});
