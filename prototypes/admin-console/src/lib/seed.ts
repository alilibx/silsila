import settingsData from "./settings.generated.json";
import type {
  Admin,
  AuditEntry,
  Db,
  DayStat,
  HelpRequest,
  Khatma,
  KhatmaMember,
  Person,
  Reading,
  RotaParticipant,
  Setting,
  WaMessage,
  WaStatus,
} from "./types";

/** Member names, phone numbers, and conversations here are invented. */
const FIRST = ["أحمد", "فاطمة", "يوسف", "مريم", "عمر", "نورة", "خالد", "سارة", "إبراهيم", "ليلى", "حسن", "زينب", "علي", "هدى", "سالم", "رقية", "طارق", "أسماء", "بدر", "شيخة", "ماجد", "عائشة", "راشد", "لطيفة", "سعيد", "منى", "حمد", "ريم", "جاسم", "دانة"];
const LAST = ["الشامسي", "الكعبي", "النعيمي", "المري", "الزعابي", "الهاشمي", "البلوشي", "القاسمي", "الظاهري", "المهيري", "الحوسني", "العامري", "السويدي", "الجابري", "الرميثي", "الفلاسي"];
const KHATMA_NAMES = ["ختمة العائلة", "ختمة الأصدقاء", "ختمة رمضان", "ختمة أهل الحي", "ختمة الوالد رحمه الله", "ختمة الوالدة", "ختمة زملاء العمل", "ختمة حلقة الفجر", "ختمة بنات العم", "ختمة الجمعة", "ختمة الجيران", "ختمة الشباب", "ختمة الأخوات", "ختمة المسجد", "ختمة دفعة ٢٠١٠"];
const ZONES = ["Asia/Dubai", "Asia/Dubai", "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Africa/Cairo", "Europe/London"];
const DEVICES = ["iPhone · Safari", "iPhone · تطبيق الشاشة الرئيسية", "Android · Chrome", "Mac · Safari", "Windows · Edge"];
const SCHEDULES = ["يومية", "كل ٣ أيام", "أسبوعية", "شهرية", "بدون موعد"];
const TEMPLATES = ["تذكير القراءة", "قاربت المهلة", "جزء اليوم", "رمز الدخول", "اكتملت الختمة", "تنبيه دخول جديد", "ترحيب", "متاح للمساعدة"];
const FAIL_REASONS = ["الرقم غير مسجل في واتساب", "انتهت نافذة ٢٤ ساعة", "لا توجد طريقة دفع للفئة التسويقية", "رفضه ميتا: تجاوز حد الإرسال"];
const SKIP_REASONS = ["الشخص أوقف الرسائل", "ساعات الهدوء", "صامت منذ ٧ أيام"];

const HELP_THREADS: { ask: string; reply?: string; path: string; attachment?: "screenshot" | "voice" }[] = [
  { ask: "غيّرت رقم هاتفي ولا أستطيع الدخول إلى ختمتي القديمة.", path: "/signin" },
  { ask: "لا يصلني رمز الدخول على واتساب منذ الصباح.", path: "/signin", attachment: "screenshot" },
  { ask: "أخذت الجزء ١٢ بالخطأ، كيف أتركه؟", reply: "اضغط على الجزء ثم «تركه». سيعود متاحاً للجميع.", path: "/k/khatma" },
  { ask: "المنظّم توفي رحمه الله ونريد نقل الختمة إلى ابنه.", path: "/k/khatma/settings" },
  { ask: "الإشعارات لا تصل على الآيفون بعد آخر تحديث.", path: "/settings", attachment: "voice" },
  { ask: "أريد حذف حسابي وكل بياناتي.", path: "/settings" },
  { ask: "شخص لا أعرفه دخل ختمتنا، كيف أخرجه؟", reply: "من إعدادات الختمة يمكنك إزالته. وإن لزم نغيّر رابط الدعوة.", path: "/k/khatma/members" },
  { ask: "رابط الدعوة لا يفتح عند أهلي.", path: "/join", attachment: "screenshot" },
  { ask: "كيف أبدأ جولة جديدة قبل نهاية الشهر؟", reply: "تبدأ الجولة تلقائياً عند اكتمال ٣٠ جزءاً.", path: "/k/khatma" },
  { ask: "وصلتني رسالة «قاربت المهلة» وأنا أنهيت جزئي.", path: "/k/khatma" },
  { ask: "أريد إضافة أمي للختمة وليس عندها واتساب.", path: "/k/khatma/members" },
  { ask: "الموقع يطلب مني التحديث كل مرة.", reply: "أغلق التبويب وافتحه من جديد، وأخبرنا إن تكررت.", path: "/" },
];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ROTA_SIZE = 30;

export function seed(): Db {
  const now = Date.now();
  const r = rng(114);
  const pick = <T,>(list: T[]): T => list[Math.floor(r() * list.length)];
  const int = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));

  const people: Person[] = Array.from({ length: 236 }, (_, i) => {
    const status = i % 37 === 11 ? "blocked" : i % 41 === 7 ? "invited" : "active";
    const verifiedAt = status === "invited" ? null : now - int(1, 150) * DAY;
    const lastSeenAt = status === "invited" ? null : now - (r() < 0.6 ? int(1, 48) * HOUR : int(3, 60) * DAY);
    return {
      id: `p${i + 1}`,
      name: `${FIRST[i % FIRST.length]} ${pick(LAST)}`,
      phone: `+97155${String(5000000 + Math.floor(r() * 4999999))}`,
      timeZone: pick(ZONES),
      status,
      verifiedAt,
      lastSeenAt,
      rotaAllowed: r() < 0.12,
      whatsappNotes: r() < 0.7,
      devices: status === "invited" ? [] : Array.from({ length: int(1, 3) }, () => ({ label: pick(DEVICES), lastUsedAt: now - int(1, 400) * HOUR })),
      adminNote: "",
    };
  });

  const khatmas: Khatma[] = Array.from({ length: 64 }, (_, i) => {
    const kind = i % 5 === 2 ? "rota" : "pool";
    const count = int(4, 30);
    const organizer = people[int(0, 200)];
    const members: KhatmaMember[] = [{ personId: organizer.id, status: "active", joinedAt: now - int(10, 150) * DAY }];
    for (let m = 0; m < count; m++) {
      const person = people[int(0, people.length - 1)];
      if (members.some((x) => x.personId === person.id)) continue;
      const roll = r();
      members.push({
        personId: person.id,
        status: roll < 0.05 ? "blocked" : roll < 0.12 ? "former" : "active",
        joinedAt: now - int(1, 120) * DAY,
        phoneHidden: kind === "rota" && r() < 0.2,
      });
    }
    return {
      id: `k${i + 1}`,
      name: `${KHATMA_NAMES[i % KHATMA_NAMES.length]}${i >= KHATMA_NAMES.length ? ` ${pick(LAST)}` : ""}`,
      kind,
      status: i % 13 === 9 ? "archived" : i % 17 === 5 ? "paused" : "active",
      organizerId: organizer.id,
      inviteCode: Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[int(0, 30)]).join(""),
      schedule: kind === "rota" ? "يومية · ٣٠ جزءاً" : pick(SCHEDULES),
      completed: int(0, 18),
      createdAt: now - int(5, 160) * DAY,
      members,
    };
  });

  // Rotating khatmas: their active members become participants with fixed slots.
  khatmas.filter((k) => k.kind === "rota").forEach((k, n) => {
    const number = int(1, 30);
    const people_ = k.members.filter((m) => m.status === "active").slice(0, 26);
    const participants: RotaParticipant[] = people_.map((m, i) => {
      const person = people.find((p) => p.id === m.personId)!;
      const roll = r();
      return {
        id: `rp${k.id}${i}`,
        name: person.name,
        phone: person.phone,
        personId: person.id,
        joinedAt: roll < 0.85 ? m.joinedAt : null,
        stoppedAt: roll > 0.97 ? now - int(1, 9) * DAY : null,
        silencedAt: roll > 0.93 && roll <= 0.97 ? now - int(1, 9) * DAY : null,
        silentDays: roll > 0.85 ? int(1, 6) : 0,
        phoneHidden: m.phoneHidden,
      };
    });
    const slots: (string | null)[] = Array.from({ length: ROTA_SIZE }, (_, i) => participants[i]?.id ?? null);
    if (participants.length > 3) slots[ROTA_SIZE - 1] = participants[0].id;
    const today = Array.from({ length: ROTA_SIZE }, (_, i) => {
      const juz = i + 1;
      const slot = ((juz - number + ROTA_SIZE) % ROTA_SIZE) + 1;
      const owner = slots[slot - 1];
      const roll = r();
      const done = owner !== null && roll < 0.55;
      return { juz, holderId: owner, readerId: owner, doneAt: done ? now - int(1, 10) * HOUR : null, doneByOrganizer: done && roll < 0.05, reassigned: false, notYet: !done && owner !== null && roll > 0.85 };
    });
    k.rota = {
      number,
      cycle: int(1, 5),
      slots,
      participants,
      today,
      joinRequests: n % 3 === 0 ? [{ id: `jr${k.id}`, name: `${pick(FIRST)} ${pick(LAST)}`, phone: `+97155${String(5000000 + Math.floor(r() * 4999999))}`, at: now - int(1, 30) * HOUR }] : [],
      joinCode: `ختمة ${int(1000, 9999)}`,
      daysLabel: n % 4 === 3 ? "كل أسبوع: الجمعة" : "كل يوم",
      firstDate: new Date(k.createdAt).toISOString().slice(0, 10),
      endDate: null,
      timeZone: "Asia/Dubai",
      messages: { dayAt: 480, reminder: { at: 960, on: true }, unread: { at: 1140, on: true }, summary: { at: 1260, on: false } },
      pausedAt: k.status === "paused" ? now - 2 * DAY : null,
      pauseDates: [],
      setupDone: true,
      pendingOrganizer: false,
    };
    k.schedule = k.rota.daysLabel;
  });

  const help: HelpRequest[] = Array.from({ length: 34 }, (_, i) => {
    const thread = HELP_THREADS[i % HELP_THREADS.length];
    const person = people[int(0, 220)];
    const khatma = khatmas.find((k) => k.members.some((m) => m.personId === person.id)) ?? null;
    const visitor = i % 11 === 6;
    const createdAt = now - (i < 6 ? int(1, 20) * HOUR : int(1, 40) * DAY);
    const replyAt = createdAt + int(1, 5) * HOUR;
    const status = i < 6 ? "open" : thread.reply ? (i < 14 ? "answered" : "closed") : "closed";
    const messages: HelpRequest["messages"] = [{ id: `m${i}a`, from: "person", text: thread.ask, at: createdAt, attachment: thread.attachment }];
    if (status !== "open") {
      messages.push({ id: `m${i}b`, from: "team", text: thread.reply ?? "تم حل الأمر من جهتنا، جزاك الله خيراً على صبرك.", at: replyAt });
    }
    return {
      id: `h${i + 1}`,
      personId: visitor ? null : person.id,
      visitorName: visitor ? "زائر غير مسجل" : null,
      khatmaId: visitor ? null : (khatma?.id ?? null),
      status,
      createdAt,
      lastMessageAt: messages[messages.length - 1].at,
      context: { path: thread.path, appVersion: "0.5.0", device: pick(DEVICES) },
      messages,
    };
  });

  const messages: WaMessage[] = Array.from({ length: 420 }, (_, i) => {
    const person = people[int(0, people.length - 1)];
    const roll = r();
    const status: WaStatus = roll < 0.07 ? "failed" : roll < 0.14 ? "skipped" : roll < 0.6 ? "read" : "delivered";
    return {
      id: `w${i + 1}`,
      personId: person.id,
      khatmaId: pick(khatmas).id,
      template: pick(TEMPLATES),
      status,
      reason: status === "failed" ? pick(FAIL_REASONS) : status === "skipped" ? pick(SKIP_REASONS) : null,
      at: now - int(1, 14 * 24 * 60) * 60_000,
    };
  }).sort((a, b) => b.at - a.at);

  const reading: Reading[] = khatmas.flatMap((k) =>
    k.members
      .filter((m) => m.status === "active")
      .flatMap((m) =>
        Array.from({ length: int(1, 6) }, (_, i): Reading => {
          const takenAt = now - int(1, 45) * DAY - int(0, 23) * HOUR;
          const roll = r();
          const status = i === 0 && roll < 0.4 ? "reading" : roll > 0.9 ? "released" : "finished";
          return {
            id: `r${k.id}${m.personId}${i}`,
            personId: m.personId,
            khatmaId: k.id,
            juz: int(1, 30),
            status,
            takenAt,
            finishedAt: status === "finished" ? Math.min(takenAt + int(6, 120) * HOUR, now) : null,
          };
        }),
      ),
  );

  const admins: Admin[] = [
    { id: "a1", name: "علي الهاشمي", phone: "+971555000101", role: "owner", addedAt: now - 60 * DAY, lastActiveAt: now - 12 * 60_000, notifyHelp: true, notifySummary: true, notifyMilestones: true },
    { id: "a2", name: "مريم الكعبي", phone: "+971555000102", role: "support", addedAt: now - 21 * DAY, lastActiveAt: now - 3 * HOUR, notifyHelp: true, notifySummary: true, notifyMilestones: true },
    { id: "a3", name: "عمر الزعابي", phone: "+971555000103", role: "viewer", addedAt: now - 9 * DAY, lastActiveAt: now - 2 * DAY, notifyHelp: false, notifySummary: false, notifyMilestones: false },
  ];

  const audit: AuditEntry[] = [
    ["علي الهاشمي", "تعديل إعداد", "setting", "maxMembers", "أقصى عدد أعضاء في الختمة", "٦٠", "٨٠", null, 3],
    ["مريم الكعبي", "حظر رقم", "phone", people[11].id, people[11].name, "نشط", "محظور", "رسائل مزعجة في الختمة", 9],
    ["مريم الكعبي", "إغلاق طلب مساعدة", "help", "h20", "طلب #٢٠", "مفتوح", "مغلق", null, 26],
    ["علي الهاشمي", "تسليم المنظّم", "khatma", "k4", khatmas[3].name, people[3].name, people[12].name, "بطلب من العائلة", 40],
    ["مريم الكعبي", "إنهاء كل الجلسات", "person", people[20].id, people[20].name, "٣ أجهزة", "٠ أجهزة", "فقد هاتفه", 52],
    ["علي الهاشمي", "إضافة مشرف", "admin", "a3", "عمر الزعابي", null, "مشاهد", null, 216],
    ["علي الهاشمي", "إعادة ضبط رابط الدعوة", "khatma", "k9", khatmas[8].name, "رابط قديم", "رابط جديد", "الرابط انتشر خارج العائلة", 300],
    ["مريم الكعبي", "السماح بالختمة بالتناوب", "person", people[33].id, people[33].name, "غير مسموح", "مسموح", null, 390],
  ].map(([actor, action, targetKind, targetId, targetLabel, before, after, note, hours], i) => ({
    id: `au${i + 1}`,
    actor: actor as string,
    action: action as string,
    targetKind: targetKind as AuditEntry["targetKind"],
    targetId: targetId as string,
    targetLabel: targetLabel as string,
    before: before as string | null,
    after: after as string | null,
    note: note as string | null,
    at: now - (hours as number) * HOUR,
  }));

  // The real list, with a few values changed so the "changed" tab has something to show.
  const changed: Record<string, Setting["value"]> = { maxMembers: 80, quietStartHour: 23, rotaSummaryOn: true };
  audit[2].via = "mcp";

  const settings: Setting[] = (settingsData.rows as Setting[]).map((row) =>
    row.key in changed ? { ...row, value: changed[row.key] } : { ...row },
  );

  const stats: DayStat[] = Array.from({ length: 30 }, (_, i) => ({
    day: now - (29 - i) * DAY,
    ajza: 90 + Math.round(i * 2.4 + 35 * Math.sin(i / 2.2) + r() * 30),
    members: 2 + Math.round(r() * 9),
    khatmas: Math.round(r() * 3),
  }));

  return { people, khatmas, help, messages, reading, audit, admins, settings, stats, disabledTools: [] };
}
