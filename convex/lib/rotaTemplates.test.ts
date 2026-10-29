import { expect, test } from "vitest";
import { DUAS } from "./duas";
import {
  alreadyText,
  assignedTemplate,
  closedText,
  completeTemplate,
  coveredTemplate,
  cycleTemplate,
  duaText,
  helpText,
  juzTemplate,
  juzText,
  notOnListText,
  notYetText,
  reminderTemplate,
  ROTA_BUTTONS,
  stopText,
  thanksText,
  welcomeText,
  whichKhatmaText,
} from "./rotaTemplates";
import { juzPhrase } from "./noteText";

const khatma = { name: "ختمة العائلة", createdAt: 0 };
const payloads = { done: "r1|p|done|d|x", notYet: "r1|p|notYet|d|x" };

test("juz' text agrees with one, two and three or more ajza'", () => {
  expect(juzPhrase([26])).toBe("الجزء ٢٦");
  expect(juzPhrase([5, 6])).toBe("الجزآن ٥ و٦");
  expect(juzPhrase([3, 5, 6])).toBe("الأجزاء ٣، ٥ و٦");
});

test("the juz' template: title header, khatma number and juz', two reply payloads in order", () => {
  expect(juzTemplate(khatma, [5, 6], 12, payloads)).toEqual({
    name: "wirdak_rota_juz",
    header: "ختمة العائلة",
    body: ["١٢", "الجزآن ٥ و٦"],
    quickReplies: [payloads.done, payloads.notYet],
  });
});

test("the reminder template", () => {
  expect(reminderTemplate(khatma, [26], payloads)).toEqual({
    name: "wirdak_rota_reminder",
    header: "ختمة العائلة",
    body: ["الجزء ٢٦"],
    quickReplies: [payloads.done, payloads.notYet],
  });
});

test("the assigned template puts the juz' before the khatma number", () => {
  expect(assignedTemplate(khatma, [3, 5, 6], 7, payloads)).toEqual({
    name: "wirdak_rota_assigned",
    header: "ختمة العائلة",
    body: ["الأجزاء ٣، ٥ و٦", "٧"],
    quickReplies: [payloads.done, payloads.notYet],
  });
});

test("the covered template has no buttons", () => {
  expect(coveredTemplate(khatma, [26])).toEqual({
    name: "wirdak_rota_covered",
    header: "ختمة العائلة",
    body: ["الجزء ٢٦"],
  });
});

test("the complete template carries the dua payload as its one button", () => {
  expect(completeTemplate(khatma, 30, "r1|p|dua|d|x")).toEqual({
    name: "wirdak_rota_complete",
    header: "ختمة العائلة",
    body: ["٣٠"],
    quickReplies: ["r1|p|dua|d|x"],
  });
});

test("the cycle template has a header and no parameters or buttons", () => {
  expect(cycleTemplate(khatma)).toEqual({
    name: "wirdak_rota_cycle",
    header: "ختمة العائلة",
    body: [],
  });
});

test("an unnamed khatma gets the untitled-date header", () => {
  expect(cycleTemplate({ name: null, createdAt: 0 }).header).toMatch(/^ختمة /);
});

test("welcome text names the day and time of the next message, if any", () => {
  expect(
    welcomeText("أحمد", "ختمة العائلة", { weekday: "الخميس", time: "٨:٠٠ ص" }),
  ).toBe(
    "أهلاً أحمد، انضممت إلى ختمة العائلة. تصلك رسالة جزئك يوم الخميس الساعة ٨:٠٠ ص.",
  );
  expect(welcomeText("أحمد", "ختمة العائلة", null)).toBe(
    "أهلاً أحمد، انضممت إلى ختمة العائلة.",
  );
});

test("the free texts use Arabic digits", () => {
  expect(juzText(3, [5, 6])).toBe("الختمة ٣ اليوم. جزؤك: الجزآن ٥ و٦.");
  expect(thanksText(12)).toBe("تقبّل الله منك. ١٢ من ٣٠ جزءاً تمّت اليوم.");
  expect(notYetText("٤:٠٠ م")).toBe("لا بأس، نذكّرك الساعة ٤:٠٠ م.");
  expect(notYetText(null)).toBe("لا بأس.");
});

test("the fixed texts", () => {
  expect(alreadyText).toBe("سجّلنا قراءتك من قبل.");
  expect(closedText).toBe("انتهى يوم هذه الختمة.");
  expect(notOnListText).toBe("أرسلنا طلبك إلى منظّم الختمة، ونخبرك حين يضيفك.");
  expect(stopText).toBe(
    "أوقفنا رسائل الختمة لك. لتعود إليها أرسل رسالة الانضمام مرة أخرى.",
  );
  expect(helpText).toBe("اضغط «أتممت» أو «ليس بعد» في رسالة جزئك.");
  expect(whichKhatmaText).toBe("لأي ختمة؟");
  expect(ROTA_BUTTONS).toEqual({
    done: "أتممت",
    notYet: "ليس بعد",
    dua: "دعاء الختم",
  });
});

test("the dua text holds both duas verbatim, with references", () => {
  const text = duaText();
  for (const dua of DUAS) {
    expect(text).toContain(dua.text);
    expect(text).toContain(dua.ref);
  }
  expect(text.indexOf(DUAS[0].text)).toBeLessThan(text.indexOf(DUAS[1].text));
});
