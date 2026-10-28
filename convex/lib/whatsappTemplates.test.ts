import { expect, test } from "vitest";
import type { NoteKind } from "./noteText";
import {
  buttonSuffix,
  khatmaTitle,
  noteTemplate,
  OPEN_FOR_HELP_MANY,
} from "./whatsappTemplates";

// Thursday 2026-10-29 08:00 in Dubai
const NOW = Date.UTC(2026, 9, 29, 4, 0);
const DAY = 86_400_000;
const khatma = { name: "ختمة رمضان", createdAt: NOW, inviteCode: "AB12CD" };
const note = (kind: NoteKind, juz = [12]) => ({
  kind,
  juz,
  count: null,
  until: null,
});

test("every note kind maps to its template and body values", () => {
  const cases: [NoteKind, string, string[]][] = [
    ["almostUp", "wirdak_almost_up", ["١٢"]],
    ["openForHelp", "wirdak_open_for_help", ["١٢"]],
    ["thanks", "wirdak_thanks", ["١٢"]],
    ["reminder", "wirdak_reminder", ["١٢"]],
    ["completed", "wirdak_completed", []],
    ["nowOrganizer", "wirdak_now_organizer", []],
    ["organizerMoved", "wirdak_organizer_moved", []],
  ];
  for (const [kind, name, body] of cases) {
    expect(noteTemplate(note(kind), khatma, "https://wirdak.app", NOW)).toEqual(
      {
        name,
        header: "ختمة رمضان",
        body,
        buttonParam: "j/AB12CD",
      },
    );
  }
});

test("open for help with several ajza' uses the plural template", () => {
  const t = noteTemplate(
    note("openForHelp", [3, 12, 15]),
    khatma,
    "https://wirdak.app",
    NOW,
  );
  expect(t.name).toBe(OPEN_FOR_HELP_MANY);
  expect(t.body).toEqual(["٣، ١٢ و١٥"]);
});

test("behind carries the count, and the day only while it is ahead", () => {
  const behind = (until: number | null) =>
    noteTemplate(
      { kind: "behind", juz: [], count: 3, until },
      khatma,
      "https://wirdak.app",
      NOW,
    ).body;
  expect(behind(NOW + 2 * DAY)).toEqual(["٣ أجزاء قبل السبت"]);
  expect(behind(NOW - DAY)).toEqual(["٣ أجزاء"]);
  expect(behind(null)).toEqual(["٣ أجزاء"]);
});

test("khatmaTitle: the name as one clean line, or the untitled date", () => {
  expect(khatmaTitle({ name: "ختمة\n  الوالدة\t", createdAt: NOW })).toBe(
    "ختمة الوالدة",
  );
  expect(khatmaTitle({ name: null, createdAt: NOW })).toBe(
    "ختمة الخميس، ٢٩ أكتوبر",
  );
  expect(khatmaTitle({ name: "ا".repeat(80), createdAt: NOW })).toHaveLength(
    60,
  );
});

test("buttonSuffix routes staging links through the /stg/ redirect", () => {
  expect(buttonSuffix("AB12", "https://stg.wirdak.app")).toBe("stg/j/AB12");
  expect(buttonSuffix("AB12", "https://wirdak.app")).toBe("j/AB12");
  expect(buttonSuffix("AB12", "http://localhost:5173")).toBe("j/AB12");
});
