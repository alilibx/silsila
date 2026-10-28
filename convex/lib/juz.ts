/** The Quran is read in 30 ajza'. */
export const JUZ_COUNT = 30;

export interface Juz {
  readonly number: number;
  /** Traditional name, taken from the opening words of the juz'. */
  readonly name: string;
  /** Arabic name of the surah that contains `startAyah`. */
  readonly startSurah: string;
  /** `"<surah>:<ayah>"` of the first ayah in the juz'. */
  readonly startAyah: string;
}

// Start points match Tanzil's quran-data.js (QuranData.Juz).
export const JUZ: readonly Juz[] = [
  { number: 1, name: "الم", startSurah: "الفاتحة", startAyah: "1:1" },
  { number: 2, name: "سيقول", startSurah: "البقرة", startAyah: "2:142" },
  { number: 3, name: "تلك الرسل", startSurah: "البقرة", startAyah: "2:253" },
  { number: 4, name: "لن تنالوا", startSurah: "آل عمران", startAyah: "3:93" },
  { number: 5, name: "والمحصنات", startSurah: "النساء", startAyah: "4:24" },
  { number: 6, name: "لا يحب الله", startSurah: "النساء", startAyah: "4:148" },
  { number: 7, name: "وإذا سمعوا", startSurah: "المائدة", startAyah: "5:82" },
  { number: 8, name: "ولو أننا", startSurah: "الأنعام", startAyah: "6:111" },
  { number: 9, name: "قال الملأ", startSurah: "الأعراف", startAyah: "7:88" },
  { number: 10, name: "واعلموا", startSurah: "الأنفال", startAyah: "8:41" },
  { number: 11, name: "يعتذرون", startSurah: "التوبة", startAyah: "9:93" },
  { number: 12, name: "وما من دابة", startSurah: "هود", startAyah: "11:6" },
  { number: 13, name: "وما أبرئ", startSurah: "يوسف", startAyah: "12:53" },
  { number: 14, name: "ربما", startSurah: "الحجر", startAyah: "15:1" },
  { number: 15, name: "سبحان", startSurah: "الإسراء", startAyah: "17:1" },
  { number: 16, name: "قال ألم", startSurah: "الكهف", startAyah: "18:75" },
  { number: 17, name: "اقترب", startSurah: "الأنبياء", startAyah: "21:1" },
  { number: 18, name: "قد أفلح", startSurah: "المؤمنون", startAyah: "23:1" },
  { number: 19, name: "وقال الذين", startSurah: "الفرقان", startAyah: "25:21" },
  { number: 20, name: "أمّن خلق", startSurah: "النمل", startAyah: "27:56" },
  {
    number: 21,
    name: "اتل ما أوحي",
    startSurah: "العنكبوت",
    startAyah: "29:46",
  },
  { number: 22, name: "ومن يقنت", startSurah: "الأحزاب", startAyah: "33:31" },
  { number: 23, name: "وما لي", startSurah: "يس", startAyah: "36:28" },
  { number: 24, name: "فمن أظلم", startSurah: "الزمر", startAyah: "39:32" },
  { number: 25, name: "إليه يرد", startSurah: "فصلت", startAyah: "41:47" },
  { number: 26, name: "حم", startSurah: "الأحقاف", startAyah: "46:1" },
  {
    number: 27,
    name: "قال فما خطبكم",
    startSurah: "الذاريات",
    startAyah: "51:31",
  },
  { number: 28, name: "قد سمع", startSurah: "المجادلة", startAyah: "58:1" },
  { number: 29, name: "تبارك", startSurah: "الملك", startAyah: "67:1" },
  { number: 30, name: "عمّ", startSurah: "النبأ", startAyah: "78:1" },
];
