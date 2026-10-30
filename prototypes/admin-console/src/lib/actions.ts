import { toast } from "sonner";
import { ar, settingText } from "./format";
import { markDone, participantName, reassign, setPaused } from "./rota";
import { canNow, change, getDb, type Permission } from "./store";
import type { AuditEntry, Db, Khatma, Person, Setting, SettingValue } from "./types";

type Via = AuditEntry["via"];

export function isDefault(setting: Setting): boolean {
  return JSON.stringify(setting.value) === JSON.stringify(setting.defaultValue);
}

/** Why `value` can't be stored, in words, or null. Values are refused, never clamped. */
export function settingError(setting: Setting, value: SettingValue): string | null {
  const { spec } = setting;
  const outOfRange = "القيمة خارج المسموح.";
  switch (spec.kind) {
    case "int":
    case "hour":
    case "time":
    case "number":
    case "duration": {
      if (typeof value !== "number" || Number.isNaN(value)) return "القيمة ليست من النوع الصحيح.";
      if (spec.kind !== "number" && spec.kind !== "duration" && !Number.isInteger(value)) return "اكتب رقماً صحيحاً.";
      const min = spec.min ?? 0;
      const max = spec.max ?? (spec.kind === "hour" ? 23 : 1425);
      if (value < min || value > max) return outOfRange;
      if (spec.kind === "time" && value % 15 !== 0) return outOfRange;
      break;
    }
    case "bool":
      if (typeof value !== "boolean") return "القيمة ليست من النوع الصحيح.";
      break;
    case "text":
      if (value !== null && typeof value !== "string") return "القيمة ليست من النوع الصحيح.";
      if (typeof value === "string" && value.length > (spec.maxLength ?? Infinity)) return "النص أطول من المسموح.";
      break;
    case "version":
      if (value !== null && !/^\d+\.\d+\.\d+$/.test(String(value))) return "اكتب رقم الإصدار بهذا الشكل: 0.5.1";
      break;
    case "grace":
      if (typeof value !== "object" || value === null) return "القيمة ليست من النوع الصحيح.";
      break;
  }
  const others = getDb().settings;
  const read = (key: string) => (key === setting.key ? value : others.find((s) => s.key === key)?.value) as number;
  if (["paceMinMs", "defaultPaceMs", "paceMaxMs"].includes(setting.key)) {
    if (!(read("paceMinMs") <= read("defaultPaceMs") && read("defaultPaceMs") <= read("paceMaxMs"))) {
      return "يجب أن تقع الوتيرة الافتراضية بين أقل وتيرة وأعلاها.";
    }
  }
  if (["quietStartHour", "quietEndHour"].includes(setting.key) && read("quietStartHour") === read("quietEndHour")) {
    return "بداية ساعات الهدوء ونهايتها لا تكونان ساعة واحدة.";
  }
  return null;
}

export function applySetting(setting: Setting, value: SettingValue, action = "تعديل إعداد", via?: Via) {
  change(
    (d) => ({ ...d, settings: d.settings.map((s) => (s.key === setting.key ? { ...s, value } : s)) }),
    {
      action,
      targetKind: "setting",
      targetId: setting.key,
      targetLabel: setting.label,
      before: settingText(setting.spec, setting.value),
      after: settingText(setting.spec, value),
      note: null,
    },
    via,
  );
  toast.success("حُفظ الإعداد، ويسري فوراً");
}

const patchPerson = (db: Db, id: string, patch: Partial<Person>): Db => ({
  ...db,
  people: db.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});
const patchKhatma = (db: Db, id: string, patch: Partial<Khatma>): Db => ({
  ...db,
  khatmas: db.khatmas.map((k) => (k.id === id ? { ...k, ...patch } : k)),
});

export type ActionArgs = { target_id: string; value?: unknown; note?: string | null };

type Def = {
  label: string;
  what: string;
  permission: Permission;
  /** Checks the target and says what will happen. Throws if it can't happen. */
  describe: (args: ActionArgs) => string;
  run: (args: ActionArgs, via: Via) => void;
};

function person(id: string): Person {
  const found = getDb().people.find((p) => p.id === id);
  if (!found) throw new Error(`No person with id ${id}`);
  return found;
}
function khatma(id: string): Khatma {
  const found = getDb().khatmas.find((k) => k.id === id);
  if (!found) throw new Error(`No khatma with id ${id}`);
  return found;
}
function rotaKhatma(id: string): Khatma {
  const found = khatma(id);
  if (!found.rota) throw new Error("This is not a rotating khatma.");
  return found;
}
function help(id: string) {
  const found = getDb().help.find((h) => h.id === id);
  if (!found) throw new Error(`No help request with id ${id}`);
  return found;
}
function setting(key: string): Setting {
  const found = getDb().settings.find((s) => s.key === key);
  if (!found) throw new Error(`No setting with key ${key}`);
  return found;
}

export const ACTIONS = {
  block_person: {
    label: "حظر رقم",
    what: "يمنع الشخص من الدخول والانضمام.",
    permission: "person.block",
    describe: ({ target_id }) => `حظر ${person(target_id).name}`,
    run: ({ target_id, note }, via) => {
      const p = person(target_id);
      change((d) => patchPerson(d, p.id, { status: "blocked", devices: [] }), { action: "حظر رقم", targetKind: "phone", targetId: p.id, targetLabel: p.name, before: "نشط", after: "محظور", note: note ?? null }, via);
    },
  },
  unblock_person: {
    label: "رفع الحظر",
    what: "يعيد للشخص إمكانية الدخول.",
    permission: "person.block",
    describe: ({ target_id }) => `رفع الحظر عن ${person(target_id).name}`,
    run: ({ target_id, note }, via) => {
      const p = person(target_id);
      change((d) => patchPerson(d, p.id, { status: "active" }), { action: "رفع الحظر", targetKind: "phone", targetId: p.id, targetLabel: p.name, before: "محظور", after: "نشط", note: note ?? null }, via);
    },
  },
  sign_out_all: {
    label: "إنهاء كل الجلسات",
    what: "يخرج الشخص من كل أجهزته.",
    permission: "person.edit",
    describe: ({ target_id }) => `إنهاء كل جلسات ${person(target_id).name}`,
    run: ({ target_id, note }, via) => {
      const p = person(target_id);
      change((d) => patchPerson(d, p.id, { devices: [] }), { action: "إنهاء كل الجلسات", targetKind: "person", targetId: p.id, targetLabel: p.name, before: `${ar(p.devices.length)} أجهزة`, after: "٠ أجهزة", note: note ?? null }, via);
    },
  },
  set_rota_allowed: {
    label: "صلاحية الختمة بالتناوب",
    what: "يسمح للشخص بإنشاء ختمات بالتناوب أو يوقف ذلك.",
    permission: "person.edit",
    describe: ({ target_id, value }) => `${value ? "السماح" : "إيقاف السماح"} لـ${person(target_id).name} بإنشاء ختمة بالتناوب`,
    run: ({ target_id, value, note }, via) => {
      const p = person(target_id);
      change((d) => patchPerson(d, p.id, { rotaAllowed: Boolean(value) }), { action: value ? "السماح بالختمة بالتناوب" : "إيقاف الختمة بالتناوب", targetKind: "person", targetId: p.id, targetLabel: p.name, before: p.rotaAllowed ? "مسموح" : "غير مسموح", after: value ? "مسموح" : "غير مسموح", note: note ?? null }, via);
    },
  },
  rename_person: {
    label: "تعديل اسم شخص",
    what: "يغيّر الاسم الظاهر.",
    permission: "person.edit",
    describe: ({ target_id, value }) => `تغيير اسم ${person(target_id).name} إلى «${String(value)}»`,
    run: ({ target_id, value, note }, via) => {
      const p = person(target_id);
      change((d) => patchPerson(d, p.id, { name: String(value) }), { action: "تعديل بيانات شخص", targetKind: "person", targetId: p.id, targetLabel: String(value), before: p.name, after: String(value), note: note ?? null }, via);
    },
  },
  reply_help: {
    label: "الرد على طلب مساعدة",
    what: "يرسل رداً باسم فريق وِردك.",
    permission: "help.reply",
    describe: ({ target_id, value }) => {
      help(target_id);
      return `إرسال هذا الرد: «${String(value)}»`;
    },
    run: ({ target_id, value }) => {
      const h = help(target_id);
      const at = Date.now();
      change((d) => ({ ...d, help: d.help.map((x) => (x.id === h.id ? { ...x, status: "answered", lastMessageAt: at, messages: [...x.messages, { id: `m${at}`, from: "team", text: String(value), at }] } : x)) }));
    },
  },
  close_help: {
    label: "إغلاق طلب مساعدة",
    what: "يغلق الطلب.",
    permission: "help.reply",
    describe: ({ target_id }) => `إغلاق الطلب: «${help(target_id).messages[0].text}»`,
    run: ({ target_id, note }, via) => {
      const h = help(target_id);
      change((d) => ({ ...d, help: d.help.map((x) => (x.id === h.id ? { ...x, status: "closed" } : x)) }), { action: "إغلاق طلب مساعدة", targetKind: "help", targetId: h.id, targetLabel: `طلب #${ar(h.id.slice(1))}`, before: h.status, after: "closed", note: note ?? null }, via);
    },
  },
  archive_khatma: {
    label: "أرشفة ختمة",
    what: "يخفي الختمة ويوقف إشعاراتها، ويمكن استعادتها.",
    permission: "khatma.edit",
    describe: ({ target_id }) => `أرشفة «${khatma(target_id).name}»`,
    run: ({ target_id, note }, via) => {
      const k = khatma(target_id);
      change((d) => patchKhatma(d, k.id, { status: "archived" }), { action: "أرشفة ختمة", targetKind: "khatma", targetId: k.id, targetLabel: k.name, before: k.status, after: "archived", note: note ?? null }, via);
    },
  },
  restore_khatma: {
    label: "استعادة ختمة",
    what: "يعيد ختمة مؤرشفة.",
    permission: "khatma.edit",
    describe: ({ target_id }) => `استعادة «${khatma(target_id).name}»`,
    run: ({ target_id, note }, via) => {
      const k = khatma(target_id);
      change((d) => patchKhatma(d, k.id, { status: "active" }), { action: "استعادة ختمة", targetKind: "khatma", targetId: k.id, targetLabel: k.name, before: k.status, after: "active", note: note ?? null }, via);
    },
  },
  hand_over: {
    label: "تسليم المنظّم",
    what: "ينقل تنظيم الختمة إلى عضو فيها.",
    permission: "khatma.edit",
    describe: ({ target_id, value }) => {
      const k = khatma(target_id);
      const next = person(String(value));
      if (!k.members.some((m) => m.personId === next.id && m.status === "active")) {
        throw new Error(`${next.name} is not an active member of this khatma`);
      }
      return `تسليم «${k.name}» إلى ${next.name}`;
    },
    run: ({ target_id, value, note }, via) => {
      const k = khatma(target_id);
      const next = person(String(value));
      change((d) => patchKhatma(d, k.id, { organizerId: next.id }), { action: "تسليم المنظّم", targetKind: "khatma", targetId: k.id, targetLabel: k.name, before: getDb().people.find((p) => p.id === k.organizerId)?.name ?? null, after: next.name, note: note ?? null }, via);
    },
  },
  rota_mark_done: {
    label: "تسجيل جزء تامّاً",
    what: "يسجل جزءاً من اليوم تامّاً في ختمة بالتناوب.",
    permission: "khatma.edit",
    describe: ({ target_id, value }) => {
      const k = rotaKhatma(target_id);
      return `تسجيل الجزء ${ar(Number(value))} تامّاً في «${k.name}»`;
    },
    run: ({ target_id, value }, via) => markDone(target_id, Number(value), via),
  },
  rota_reassign: {
    label: "إسناد جزء",
    what: "يسند جزءاً من اليوم إلى مشارك آخر.",
    permission: "khatma.edit",
    describe: ({ target_id, value }) => {
      const k = rotaKhatma(target_id);
      const { juz, participant_id: who } = value as { juz: number; participant_id: string };
      const name = participantName(k.rota!, who);
      if (!name) throw new Error("No such participant. Use get_rota_today.");
      return `إسناد الجزء ${ar(juz)} إلى ${name} في «${k.name}»`;
    },
    run: ({ target_id, value }, via) => {
      const { juz, participant_id: who } = value as { juz: number; participant_id: string };
      reassign(target_id, juz, who, via);
    },
  },
  rota_set_paused: {
    label: "إيقاف ختمة بالتناوب أو تشغيلها",
    what: "يوقف رسائلها وتقدّمها أو يعيدها.",
    permission: "khatma.edit",
    describe: ({ target_id, value }) => `${value ? "إيقاف" : "إعادة تشغيل"} «${rotaKhatma(target_id).name}»`,
    run: ({ target_id, value }, via) => setPaused(target_id, Boolean(value), via),
  },
  set_setting: {
    label: "تغيير إعداد",
    what: "يغيّر إعداداً ضمن المسموح.",
    permission: "settings.edit",
    describe: ({ target_id, value }) => {
      const s = setting(target_id);
      const problem = settingError(s, value as SettingValue);
      if (problem) throw new Error(problem);
      return `${s.label}: من ${settingText(s.spec, s.value)} إلى ${settingText(s.spec, value as SettingValue)}`;
    },
    run: ({ target_id, value }, via) => applySetting(setting(target_id), value as SettingValue, "تعديل إعداد", via),
  },
} satisfies Record<string, Def>;

export type ActionKind = keyof typeof ACTIONS;

export function describeAction(kind: ActionKind, args: ActionArgs): string {
  const def: Def = ACTIONS[kind];
  if (!def) throw new Error(`Unknown action ${kind}`);
  if (!canNow(def.permission)) throw new Error("This admin's role does not allow that.");
  if (getDb().disabledTools.includes(kind)) throw new Error("The owner turned this action off.");
  return def.describe(args);
}

export function runAction(kind: ActionKind, args: ActionArgs, via: Via) {
  const def: Def = ACTIONS[kind];
  def.run(args, via);
}
