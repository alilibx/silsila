import { expect, test } from "vitest";
import { noteText } from "./noteText";

const NOW = 1_800_000_000_000; // Friday 2027-01-15, midday in Asia/Dubai
const DAY = 86_400_000;

const base = { juz: [], count: null, until: null };

test("noteText covers every kind in Eastern digits", () => {
  expect(noteText({ ...base, kind: "almostUp", juz: [12] })).toBe(
    "مهلة الجزء ١٢ أوشكت على الانتهاء. هل تحتاج وقتاً أطول؟",
  );
  expect(noteText({ ...base, kind: "openForHelp", juz: [12] })).toBe(
    "الجزء ١٢ متاح لمن يساعد. هل تأخذه أو ترسل الدعوة؟",
  );
  expect(noteText({ ...base, kind: "openForHelp", juz: [12, 15] })).toBe(
    "الأجزاء ١٢ و١٥ متاحة لمن يساعد. هل تأخذ أحدها أو ترسل الدعوة؟",
  );
  expect(
    noteText({ ...base, kind: "openForHelp", juz: [3, 12, 15] }),
  ).toContain("٣، ١٢ و١٥");
  expect(noteText({ ...base, kind: "thanks", juz: [7] })).toBe(
    "أحدهم يُكمل الجزء ٧ الآن. جزاكما الله خيراً.",
  );
  expect(noteText({ ...base, kind: "reminder", juz: [30] })).toBe(
    "الجزء ٣٠ في انتظارك، يسّر الله لك.",
  );
  expect(noteText({ ...base, kind: "completed" })).toBe(
    "ختمنا القرآن معاً، الحمد لله",
  );
  expect(noteText({ ...base, kind: "nowOrganizer" })).toBe(
    "أصبحتَ منظّم هذه الختمة. جزاك الله خيراً.",
  );
  expect(noteText({ ...base, kind: "organizerMoved" })).toBe(
    "مرّ وقت منذ زيارتك، فنقلنا تنظيم الختمة إلى أحد أعضائها ليستمر الخير. ما زلت عضواً فيها.",
  );
});

test("behind agrees the count with the noun", () => {
  const text = (count: number) =>
    noteText({ ...base, kind: "behind", count }, NOW);
  expect(text(1)).toBe("الختمة تحتاج جزءاً واحداً. هل تأخذ جزءاً؟");
  expect(text(2)).toContain("جزأين");
  expect(text(3)).toContain("٣ أجزاء");
  expect(text(10)).toContain("١٠ أجزاء");
  expect(text(11)).toContain("١١ جزءاً");
  expect(text(12)).toContain("١٢ جزءاً");
});

test("behind names the weekday within 6 days, the date beyond, and nothing once passed", () => {
  const text = (until: number) =>
    noteText({ ...base, kind: "behind", count: 2, until }, NOW);
  expect(text(NOW + 2 * DAY)).toBe(
    "الختمة تحتاج جزأين قبل الأحد. هل تأخذ جزءاً؟",
  );
  expect(text(NOW + 6 * DAY)).toContain("قبل الخميس");
  expect(text(NOW + 10 * DAY)).toBe(
    "الختمة تحتاج جزأين قبل ٢٥ يناير. هل تأخذ جزءاً؟",
  );
  expect(text(NOW - DAY)).toBe("الختمة تحتاج جزأين. هل تأخذ جزءاً؟");
  expect(text(NOW)).toBe("الختمة تحتاج جزأين. هل تأخذ جزءاً؟");
});
