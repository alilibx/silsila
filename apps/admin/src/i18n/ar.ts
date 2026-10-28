/** Every admin panel string lives here. Components never contain Arabic literals. */
export const ar = {
  app: { name: "وِردك" },
  badge: "الإدارة",
  nav: {
    home: "الرئيسية",
    settings: "الإعدادات",
    audit: "السجل",
    admins: "المشرفون",
  },
  signIn: {
    title: "الدخول إلى لوحة الإدارة",
    intro: "سنفتح واتساب برسالة جاهزة. أرسلها كما هي، ثم اكتب الرمز الذي يصلك.",
    start: "الدخول عبر واتساب",
    waiting: "بانتظار رسالتك…",
    openAgain: "افتح واتساب مرة أخرى",
    pinLabel: "الرمز المكوّن من ٦ أرقام",
    confirm: "دخول",
    again: "ابدأ من جديد",
    errors: {
      expired: "انتهت صلاحية الرمز. ابدأ من جديد.",
      rejected: "انتهت صلاحية الرمز. ابدأ من جديد.",
      wrong_pin: "الرمز غير صحيح. تأكد منه ثم حاول مرة أخرى.",
      too_many_attempts: "محاولات كثيرة. ابدأ من جديد.",
      rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول.",
      whatsapp_not_configured: "التحقق عبر واتساب غير متاح الآن.",
      generic: "تعذّر الدخول. تأكد من الإنترنت ثم حاول مرة أخرى.",
    },
  },
  signOut: {
    button: "تسجيل الخروج",
    done: "انتهت كل جلسات الإدارة.",
    invalid: "الرابط غير صالح أو مستخدم.",
    working: "لحظة…",
  },
} as const;

export const t = ar;
