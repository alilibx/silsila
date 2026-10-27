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
  sheet: {
    close: "إغلاق",
  },
  verify: {
    beforeTake: "قبل أن تأخذ جزءاً",
    intro:
      "نتحقق من رقمك مرة واحدة فقط، ليعرفك أحبابك وتعود إلى ختماتك من أي هاتف.",
    nameLabel: "ما اسمك؟",
    namePlaceholder: "مثلاً: أبو علي",
    start: "تحقّق عبر واتساب",
    starting: "جارٍ التحضير",
    startHint:
      "سيفتح واتساب ومعه رسالة جاهزة. اضغط «إرسال» فقط، ثم ارجع إلى هنا.",
    waitingTitle: "بانتظار رسالتك على واتساب",
    waitingHint: "اضغط «إرسال» في واتساب ثم ارجع إلى هنا. سنكمل تلقائياً.",
    openWhatsApp: "افتح واتساب",
    reopenWhatsApp: "افتح واتساب مرة أخرى",
    confirmTitle: (name: string) => `تمّ التحقق، أهلاً ${name}`,
    yourNumber: "رقمك:",
    yes: "نعم، هذا رقمي",
    notMe: "ليس رقمي",
    pinTitle: "أرسلنا لك رمزاً على واتساب",
    pinHint: "هذا الرقم مسجّل عندنا. اكتب الرمز المكوّن من ستة أرقام.",
    pinLabel: "رمز الدخول",
    pinSubmit: "تأكيد",
    devicesTitle: "أنت مسجّل الدخول على أجهزة أخرى",
    devicesHint: "تستطيع تسجيل الخروج منها الآن، أو المتابعة وتركها كما هي.",
    lastUsed: (date: string) => `آخر استخدام: ${date}`,
    signOutOthers: "تسجيل الخروج من كل الأجهزة الأخرى",
    keep: "متابعة",
    retry: "حاول مرة أخرى",
    errors: {
      nameRequired: "اكتب اسمك ليعرفك أحبابك.",
      invalid_name: "لم نستطع قبول هذا الاسم. اكتب اسماً قصيراً بحروف عادية.",
      rate_limited: "حاولتَ مرات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
      maintenance: "سلسلة في صيانة قصيرة الآن. حاول بعد قليل بإذن الله.",
      whatsapp_not_configured:
        "التحقق عبر واتساب غير متاح الآن. نعمل على إصلاحه.",
      network: "تعذّر الاتصال. تأكد من الإنترنت ثم حاول مرة أخرى.",
      generic: "حدث خطأ غير متوقع. حاول مرة أخرى.",
      expired: "انتهت مهلة الرمز. ابدأ من جديد، ولن يستغرق ذلك دقيقة.",
      rejected: "حسناً، لم نربط هذا الرقم. جرّب مرة أخرى بالرقم الذي تقصده.",
      wrong_pin:
        "الرمز غير صحيح. راجعه في رسالة واتساب وحاول مرة أخرى. عدد المحاولات محدود.",
      too_many_attempts:
        "تجاوزتَ عدد المحاولات المسموح. ابدأ من جديد لتحصل على رمز جديد.",
    },
  },
} as const;

export const t = ar;
