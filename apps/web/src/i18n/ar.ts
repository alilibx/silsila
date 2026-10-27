import type { Schedule } from "@convex/lib/schedule";

/** Every UI string lives here. Components never contain Arabic literals. */
export const ar = {
  app: {
    name: "سلسلة",
  },
  pages: {
    home: "ختماتي",
    create: "ختمة جديدة",
    khatma: "الختمة",
    signOut: "تسجيل الخروج",
  },
  common: {
    loading: "جارٍ التحميل",
    listSeparator: "، ",
    home: "الصفحة الرئيسية",
  },
  notFound: {
    dead: "هذا الرابط لم يعد يعمل. اطلب من صاحب الدعوة رابطاً جديداً.",
  },
  schedules: {
    daily: "يومية",
    every3days: "كل ثلاثة أيام",
    weekly: "أسبوعية",
    biweekly: "كل أسبوعين",
    monthly: "شهرية",
    none: "بلا موعد محدد",
  } satisfies Record<Schedule, string>,
  khatma: {
    invited: (inviter: string) => `دعاك ${inviter} إلى هذه الختمة.`,
    invitedAnon: "دُعيتَ إلى هذه الختمة.",
    verifyHint: "تصفّحها بحرية، وعندما تأخذ جزءاً نتحقق من رقمك عبر واتساب.",
    untitled: (date: string) => `ختمة ${date}`,
    round: (n: string) => `الختمة ${n}`,
    target: (date: string) => `الهدف: ${date}`,
    groupTotal: (n: string) => `ختمتم معاً ${n} ختمة، الحمد لله`,
    poolHeading: "الأجزاء الثلاثون",
    openCount: (n: string) => `${n} متاح`,
  },
  ring: {
    ofThirty: (total: string) => `من ${total} جزءاً تمّت`,
    label: (done: string, total: string) => `تمّ ${done} من ${total} جزءاً`,
  },
  tile: {
    open: "متاح",
    reading: "يُقرأ",
    mine: "أنت تقرؤه",
    done: "تمّ ✓",
    doneWord: "تمّ",
    juz: (n: string) => `الجزء ${n}`,
  },
  legend: {
    open: "متاح",
    reading: "يُقرأ",
    done: "تمّ",
  },
  card: {
    held: "جزؤك الآن",
    startsFrom: (surah: string) => `يبدأ من سورة ${surah}`,
    finish: "أتممتُ القراءة",
    release: "لا أستطيع إكماله",
    take: "خذ جزءاً",
    suggest: (n: string, name: string) => `نقترح عليك الجزء ${n} «${name}»`,
    pickYourself: "أو اختر جزءاً بنفسك",
    allTaken: "كل الأجزاء مأخوذة الآن",
    allTakenHint: "ننتظر أحبابنا يُتمّون قراءتهم.",
  },
  device: {
    unknownDevice: "جهاز",
    unknownBrowser: "متصفح",
  },
} as const;

export const t = ar;
