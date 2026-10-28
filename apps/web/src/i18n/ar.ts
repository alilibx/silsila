import { toArabicDigits } from "@convex/lib/digits";
import { noteText } from "@convex/lib/noteText";
import type { Schedule } from "@convex/lib/schedule";

/** Copy every feature shares for failures it cannot explain more precisely. */
const commonErrors = {
  maintenance: "وِردك في صيانة قصيرة الآن. حاول بعد قليل بإذن الله.",
  network: "تعذّر الاتصال. تأكد من الإنترنت ثم حاول مرة أخرى.",
  generic: "حدث خطأ غير متوقع. حاول مرة أخرى.",
} as const;

/**
 * A count with its noun, agreeing in Arabic: 1 and 2 use the singular and the dual with no digit,
 * 3 to 10 use the plural, 11 and up use the singular again (in the accusative, `many`).
 */
function counted(
  n: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const digits = toArabicDigits(n);
  return n >= 3 && n <= 10
    ? `${digits} ${forms.few}`
    : `${digits} ${forms.many}`;
}

/** Every UI string lives here. Components never contain Arabic literals. */
export const ar = {
  errors: commonErrors,
  app: {
    name: "وِردك",
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
  errorBoundary: {
    title: "عذراً، تعثّرت الصفحة",
    body: "لم نستطع عرض هذه الصفحة الآن. أعد تحميلها، وإن تكرر ذلك فحاول بعد قليل بإذن الله.",
    reload: "أعد تحميل الصفحة",
  },
  notFound: {
    dead: "هذا الرابط لم يعد يعمل. اطلب من صاحب الدعوة رابطاً جديداً.",
  },
  schedules: {
    daily: "يومية",
    every3days: "كل ٣ أيام",
    weekly: "أسبوعية",
    biweekly: "كل أسبوعين",
    monthly: "شهرية",
    none: "بدون موعد",
  } satisfies Record<Schedule, string>,
  khatma: {
    invited: (inviter: string) => `دعاك ${inviter} إلى هذه الختمة.`,
    invitedAnon: "دُعيتَ إلى هذه الختمة.",
    verifyHint: "تصفّحها بحرية، وعندما تأخذ جزءاً نتحقق من رقمك عبر واتساب.",
    // The invite preview (lib/og.ts) repeats this wording; change both together.
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
    stillReading: "ما زلت أقرأ",
    openForHelp: "يمكن لغيرك أن يساعد فيه الآن، ويمكنك إتمامه إن شئت.",
    /** Whole days, 1 to 7: `يوم`, `يومين`, `٣ أيام`. */
    pace: (days: number) =>
      `عادةً تُتمّ الجزء في نحو ${counted(days, {
        one: "يوم",
        two: "يومين",
        few: "أيام",
        many: "يوماً",
      })}`,
  },
  notes: {
    heading: "رسائل لك",
    /** The only door to the note texts: components never import them directly. */
    text: noteText,
    stillReading: "ما زلت أقرأ",
    finished: "أتممت القراءة",
    cantFinish: "لا أستطيع إكماله",
    takeJuz: "خذ الجزء",
    sendInvite: "أرسل الدعوة",
    takeOne: "خذ جزءاً",
    ok: "حسناً",
    /** The label beside the dot on the home page's khatma card. */
    newMessage: "رسالة جديدة",
  },
  grace: {
    label: "مهلة كل جزء",
    summary: (amount: string) => `مهلة كل جزء: ${amount}`,
    change: "تغيير",
    done: "تمّ",
    amountLabel: "المدة",
    unitsLabel: "الوحدة",
    units: { minutes: "دقائق", hours: "ساعات", days: "أيام" },
    range: "المهلة بين ٣٠ دقيقة و٣٠ يوماً.",
    amount: {
      minutes: (n: number) =>
        counted(n, {
          one: "دقيقة",
          two: "دقيقتان",
          few: "دقائق",
          many: "دقيقة",
        }),
      hours: (n: number) =>
        counted(n, {
          one: "ساعة",
          two: "ساعتان",
          few: "ساعات",
          many: "ساعة",
        }),
      days: (n: number) =>
        counted(n, { one: "يوم", two: "يومان", few: "أيام", many: "يوماً" }),
    },
  },
  khatmaSettings: {
    link: "إعدادات الختمة",
    notifications: "إشعارات هذه الختمة",
    on: "مفعّلة",
    off: "متوقفة",
  },
  organizer: {
    back: "العودة إلى الختمة",
    nameHeading: "الاسم",
    save: "حفظ",
    saved: "تمّ الحفظ",
    cancel: "تراجع",
    scheduleNote: "يبدأ التغيير من الختمة القادمة",
    graceNote:
      "إن احتاج القارئ وقتاً أطول يستطيع طلبه مرة واحدة، وبعدها يمكن لغيرك أن يساعد.",
    suggested: (amount: string) => `المقترح لهذا الموعد: ${amount}`,
    membersHeading: "الأعضاء",
    organizerBadge: "المنظّم",
    makeOrganizer: "اجعله المنظّم",
    remove: "إزالة",
    handoverTitle: (name: string) => `اجعل ${name} المنظّم؟`,
    handoverBody:
      "ستصبح عضواً عادياً، ولن تستطيع بعد ذلك تغيير إعدادات الختمة.",
    removeTitle: (name: string) => `إزالة ${name}؟`,
    removeBody:
      "سيعود جزؤه إلى الختمة، ولن يستطيع الانضمام مرة أخرى حتى تسمح له.",
    blockedHeading: "من أُزيلوا",
    allow: "السماح بالعودة",
    resetHeading: "رابط الدعوة",
    reset: "غيّر رابط الدعوة",
    resetTitle: "تغيير رابط الدعوة؟",
    resetBody:
      "الروابط القديمة ستتوقف عن العمل. أرسل الرابط الجديد إلى المجموعة.",
    resetConfirm: "غيّر الرابط",
    errors: {
      maintenance: commonErrors.maintenance,
      network: commonErrors.network,
      generic: commonErrors.generic,
    },
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
      maintenance: commonErrors.maintenance,
      whatsapp_not_configured:
        "التحقق عبر واتساب غير متاح الآن. نعمل على إصلاحه.",
      network: commonErrors.network,
      generic: commonErrors.generic,
      expired: "انتهت مهلة الرمز. ابدأ من جديد، ولن يستغرق ذلك دقيقة.",
      rejected: "حسناً، لم نربط هذا الرقم. جرّب مرة أخرى بالرقم الذي تقصده.",
      wrong_pin:
        "الرمز غير صحيح. راجعه في رسالة واتساب وحاول مرة أخرى. عدد المحاولات محدود.",
      too_many_attempts:
        "تجاوزتَ عدد المحاولات المسموح. ابدأ من جديد لتحصل على رمز جديد.",
    },
  },
  signIn: {
    button: "عندك ختمات؟ ادخل برقمك",
    title: "ادخل برقمك",
  },
  toast: {
    taken: (n: string) => `الجزء ${n} لك الآن. يسّر الله لك`,
    finished: "تقبّل الله منك 🤍",
    undo: "تراجع",
    undone: "أعدنا الجزء إليك. أتمّه متى تيسّر.",
    released: "أعدناه إلى الختمة. جزاك الله خيراً",
    stillReading: "أعطيناك وقتاً إضافياً. يسّر الله لك.",
    /** Someone else took the reader's juz' as they tapped finish. */
    takenOver: (n: string) => `أحدهم يُكمل الجزء ${n} الآن. جزاكما الله خيراً.`,
  },
  take: {
    confirm: "نعم، هذا جزئي",
    notNow: "ليس الآن",
    as: (name: string) => `تأخذه باسم ${name}`,
    notYou: (name: string) => `لستَ ${name}؟`,
  },
  release: {
    title: "لا بأس، جزاك الله خيراً",
    body: (n: string) => `سنعيد الجزء ${n} ليقرأه غيرك. لن يعرف أحد أنك أعدته.`,
    confirm: "أعِده إلى الختمة",
    keep: "سأكمله إن شاء الله",
  },
  push: {
    title: "تذكير لطيف",
    body: "نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً.",
    enable: "فعّل الإشعارات",
    notNow: "ليس الآن",
  },
  install: {
    title: "أضف وِردك إلى الشاشة الرئيسية",
    intro:
      "لتصلك الإشعارات على الآيفون، أضف وِردك إلى الشاشة الرئيسية الآن، ونافذة الخطوات هذه مفتوحة. ثم افتحه من هناك، وستجده مفتوحاً بحسابك.",
    steps: {
      share: "اضغط زر المشاركة",
      add: "اختر «إضافة إلى الشاشة الرئيسية»",
      confirm: "اضغط «أضف»",
    },
    added: "أضفتُه",
    notNow: "ليس الآن",
  },
  /** Why an action did not go through. Every reason the server can give has kind copy. */
  actions: {
    errors: {
      notHolding: "ليس معك جزء الآن.",
      /** The session ended on another device (signed out from there, say). */
      signedOut: "خرجتَ من حسابك على هذا الجهاز. سجّل دخولك من جديد لتكمل.",
      shared: {
        blocked:
          "لا نستطيع تنفيذ ذلك الآن. تواصل مع صاحب الختمة إن احتجت مساعدة.",
        maintenance: commonErrors.maintenance,
        rate_limited: "ضغطتَ مرات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
      },
      take: {
        taken: "سبقك أحدهم إليه. اخترنا لك غيره.",
        already_holding: "معك جزء الآن. أتمّه أو أعِده أولاً، ثم خذ غيره.",
        khatma_full: "اكتمل عدد المشاركين في هذه الختمة.",
      },
      stillReading: {
        already_extended: "أعطيناك وقتاً إضافياً من قبل لهذا الجزء.",
        opened: "لم يعد الوقت الإضافي متاحاً. يمكنك إتمام الجزء متى شئت.",
      },
      undo: {
        window_closed: "انتهت مهلة التراجع. الجزء محسوب لك، تقبّل الله منك.",
        holding_another: "معك جزء آخر الآن، فلا نستطيع إرجاع هذا إليك.",
        round_completed: "اكتملت الختمة، فلا يمكن التراجع الآن.",
        nothing_to_undo: "لا يوجد ما نتراجع عنه الآن.",
      },
    },
  },
  home: {
    hello: (name: string) => `السلام عليكم، ${name}`,
    helloAnon: "السلام عليكم",
    signedOutIntro:
      "وِردك يجمع أحبابك على ختمة واحدة للقرآن، يأخذ كل واحد جزءاً واحداً في كل مرة. أنشئ ختمة وادعُ أهلك وأصحابك.",
    empty: "لا توجد ختمات بعد. ابدأ ختمة جديدة وادعُ أحبابك إليها.",
    startNew: "＋ ابدأ ختمة جديدة",
    startNewPlain: "ابدأ ختمة جديدة",
    settings: "إعداداتي",
    doneOf: (done: string, total: string) => `${done} من ${total} تمّت`,
    yours: (n: string, name: string) => `جزؤك: الجزء ${n} «${name}»`,
    loadError: commonErrors.network,
  },
  create: {
    nameLabel: "اسم الختمة",
    optional: "(اختياري)",
    namePlaceholder: (date: string) => `ختمة ${date}`,
    scheduleLegend: "كل كم تختمون؟",
    subtitles: {
      daily: "نختم كل يوم",
      weekly: "الأكثر شيوعاً",
      none: "نقرأ على راحتنا",
    } as Partial<Record<Schedule, string>>,
    graceInvalid: "عدّل مهلة كل جزء لتكون بين ٣٠ دقيقة و٣٠ يوماً.",
    submit: "أنشئ الختمة",
    submitting: "جارٍ الإنشاء",
    beforeCreate: "قبل أن تنشئ ختمة",
    back: "رجوع",
    errors: {
      rate_limited:
        "أنشأتَ ختمات كثيرة اليوم. جرّب غداً بإذن الله، أو استخدم إحدى ختماتك.",
      maintenance: commonErrors.maintenance,
      network: commonErrors.network,
      generic: commonErrors.generic,
    },
  },
  share: {
    inviteButton: "ادعُ أحبابك",
    remindButton: "ذكّر المجموعة",
    inviteTitle: "ادعُ أحبابك",
    createdTitle: "تمّ إنشاء الختمة. ادعُ أحبابك",
    remindTitle: "ذكّر المجموعة",
    previewHint: "هذه الرسالة التي ستُرسل:",
    remindNote: "الرسالة لا تذكر أسماء أحد",
    send: "أرسل على واتساب",
    done: "تمّ",
    preparing: "جارٍ تجهيز رابطك",
    error: commonErrors.network,
  },
  messages: {
    invite: (name: string, url: string) =>
      `السلام عليكم 🤍\nانضم إلينا في «${name}». نختم القرآن معاً، وكل واحد يأخذ جزءاً واحداً في كل مرة.\nاضغط هنا: ${url}`,
    remindCount: (n: number, digits: string) =>
      n === 1
        ? "بقي جزء واحد"
        : n === 2
          ? "بقي جزءان"
          : n <= 10
            ? `بقي ${digits} أجزاء`
            : `بقي ${digits} جزءاً`,
    remind: (name: string, remaining: string, until: string | null) =>
      `السلام عليكم 🤍\n«${name}»: ${remaining}${until ? ` حتى ${until}` : ""}.`,
    remindOpen: (list: string) => `الأجزاء المتاحة: ${list}`,
    remindLink: (url: string) => `خذ جزءاً من هنا: ${url}`,
  },
  signOut: {
    confirmTitle: "تسجيل دخول لم تقم به؟",
    confirmBody:
      "سنسجّل الخروج من كل الأجهزة المسجّلة برقمك، فلا يبقى لأحد غيرك دخول إلى حسابك. تستطيع الدخول من جديد متى شئت.",
    confirm: "نعم، سجّل الخروج",
    kept: "سجّلنا خروج الأجهزة الأخرى. هذا الجهاز ما زال مسجّلاً.",
    all: "سجّلنا خروجك من كل الأجهزة.",
    owner: "سجّلنا خروج كل أجهزة صاحب الرقم.",
    invalid: "هذا الرابط لم يعد صالحاً.",
    error: commonErrors.network,
    retry: "حاول مرة أخرى",
  },
  settings: {
    nameLabel: "اسمك",
    save: "احفظ الاسم",
    saving: "جارٍ الحفظ",
    saved: "تمّ حفظ الاسم",
    numberLabel: "رقمك",
    devicesHeading: "الأجهزة المسجّلة",
    thisDevice: "هذا الجهاز",
    lastUsed: (date: string) => `آخر استخدام: ${date}`,
    signOut: "تسجيل خروج",
    signOutOthers: "تسجيل الخروج من كل الأجهزة الأخرى",
    signedOutOthers: "سجّلنا خروج الأجهزة الأخرى.",
    signedOutOne: "سجّلنا خروج ذلك الجهاز.",
    signedOutPrompt:
      "لا يوجد حساب مسجّل على هذا الجهاز. ابدأ ختمة أو انضم إلى ختمة، وسنتحقق من رقمك عبر واتساب.",
    errors: {
      invalid_name: "لم نستطع قبول هذا الاسم. اكتب اسماً قصيراً بحروف عادية.",
      maintenance: "وِردك في صيانة قصيرة الآن. احفظ اسمك بعد قليل بإذن الله.",
      rate_limited:
        "غيّرتَ اسمك مرات كثيرة في وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.",
      network: commonErrors.network,
    },
  },
  celebration: {
    title: "ختمنا القرآن معاً",
    subtitle: (name: string, round: string) =>
      `الحمد لله، ${name}، الختمة ${round}`,
    participants: (n: string) => `شارك فيها ${n} من أحبابك`,
    share: "شارك الفرحة على واتساب",
    shareMessage: (round: string) =>
      `الحمد لله، ختمنا القرآن معاً للمرة ${round} 🤍\nتقبّل الله منا ومنكم.`,
    continue: "تابع إلى الختمة",
    // Tanzil Quran Text (Uthmani, Version 1.1), https://tanzil.net — copied verbatim, do not edit
    duas: [
      {
        text: "رَبَّنَا تَقَبَّلْ مِنَّآ ۖ إِنَّكَ أَنتَ ٱلسَّمِيعُ ٱلْعَلِيمُ",
        ref: "البقرة ١٢٧",
      },
      {
        text: "رَبَّنَآ ءَاتِنَا فِى ٱلدُّنْيَا حَسَنَةً وَفِى ٱلْـَٔاخِرَةِ حَسَنَةً وَقِنَا عَذَابَ ٱلنَّارِ",
        ref: "البقرة ٢٠١",
      },
    ],
  },
} as const;

export const t = ar;
