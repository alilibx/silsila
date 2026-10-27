import type { Schedule } from "@convex/lib/schedule";

/** Copy every feature shares for failures it cannot explain more precisely. */
const commonErrors = {
  network: "تعذّر الاتصال. تأكد من الإنترنت ثم حاول مرة أخرى.",
  generic: "حدث خطأ غير متوقع. حاول مرة أخرى.",
} as const;

/** Every UI string lives here. Components never contain Arabic literals. */
export const ar = {
  errors: commonErrors,
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
  toast: {
    taken: (n: string) => `الجزء ${n} لك الآن. يسّر الله لك`,
    finished: "تقبّل الله منك 🤍",
    undo: "تراجع",
    undone: "أعدنا الجزء إليك. أتمّه متى تيسّر.",
    released: "أعدناه إلى الختمة. جزاك الله خيراً",
  },
  take: {
    confirm: "نعم، هذا جزئي",
    notNow: "ليس الآن",
  },
  release: {
    title: "لا بأس، جزاك الله خيراً",
    body: (n: string) => `سنعيد الجزء ${n} ليقرأه غيرك. لن يعرف أحد أنك أعدته.`,
    confirm: "أعِده إلى الختمة",
    keep: "سأكمله إن شاء الله",
  },
  /** Why an action did not go through. Every reason the server can give has kind copy. */
  actions: {
    errors: {
      notHolding: "ليس معك جزء الآن.",
      shared: {
        blocked:
          "لا نستطيع تنفيذ ذلك الآن. تواصل مع صاحب الختمة إن احتجت مساعدة.",
        maintenance: "سلسلة في صيانة قصيرة الآن. حاول بعد قليل بإذن الله.",
        rate_limited: "ضغطتَ مرات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
      },
      take: {
        taken: "سبقك أحدهم إليه. اخترنا لك غيره.",
        already_holding: "معك جزء الآن. أتمّه أو أعِده أولاً، ثم خذ غيره.",
        khatma_full: "اكتمل عدد المشاركين في هذه الختمة.",
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
      "سلسلة تجمع أحبابك على ختمة واحدة للقرآن، يأخذ كل واحد جزءاً واحداً في كل مرة. أنشئ ختمة وادعُ أهلك وأصحابك.",
    empty: "لا توجد ختمات بعد. ابدأ ختمة جديدة وادعُ أحبابك إليها.",
    startNew: "＋ ابدأ ختمة جديدة",
    startNewPlain: "ابدأ ختمة جديدة",
    settings: "إعداداتي",
    doneOf: (done: string, total: string) => `${done} من ${total} تمّت`,
    yours: (n: string, name: string) => `جزؤك: ${n} · ${name}`,
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
    submit: "أنشئ الختمة",
    submitting: "جارٍ الإنشاء",
    beforeCreate: "قبل أن تنشئ ختمة",
    back: "رجوع",
    errors: {
      rate_limited:
        "أنشأتَ ختمات كثيرة اليوم. جرّب غداً بإذن الله، أو استخدم إحدى ختماتك.",
      maintenance: "سلسلة في صيانة قصيرة الآن. حاول بعد قليل بإذن الله.",
      not_signed_in: "سجّل دخولك أولاً ثم أنشئ الختمة.",
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
    kept: "سجّلنا خروج الأجهزة الأخرى. هذا الجهاز ما زال مسجّلاً.",
    all: "سجّلنا خروجك من كل الأجهزة.",
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
      network: commonErrors.network,
    },
  },
  celebration: {
    title: "ختمنا القرآن معاً",
    subtitle: (name: string, round: string) =>
      `الحمد لله · ${name} · الختمة ${round}`,
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
