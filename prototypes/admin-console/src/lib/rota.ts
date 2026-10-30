import { ar } from "./format";
import { change, getDb } from "./store";
import type { AuditEntry, Db, Khatma, RotaMessages, RotaParticipant, RotaRead, RotaState } from "./types";

export const ROTA_SIZE = 30;

type Via = AuditEntry["via"];

/** Each khatma moves a reader up one juz'; after 30 it goes back to 1. */
export function juzOfSlot(slot: number, number: number): number {
  return ((slot + number - 2) % ROTA_SIZE) + 1;
}

export function slotOfJuz(juz: number, number: number): number {
  return ((juz - number + ROTA_SIZE) % ROTA_SIZE) + 1;
}

export function participantName(rota: RotaState, id: string | null): string | null {
  return rota.participants.find((p) => p.id === id)?.name ?? null;
}

export function slotsOf(rota: RotaState, participantId: string): number[] {
  return rota.slots.flatMap((owner, i) => (owner === participantId ? [i + 1] : []));
}

export function freeSlots(rota: RotaState): number[] {
  return rota.slots.flatMap((owner, i) => (owner === null ? [i + 1] : []));
}

export function doneCount(rota: RotaState): number {
  return rota.today.filter((r) => r.doneAt !== null).length;
}

function maxSlots(): number {
  return getDb().settings.find((s) => s.key === "rotaMaxSlotsPerPerson")?.value as number;
}

function current(id: string): Khatma & { rota: RotaState } {
  const k = getDb().khatmas.find((x) => x.id === id);
  if (!k?.rota) throw new Error("هذه ليست ختمة بالتناوب.");
  if (k.status === "archived") throw new Error("هذه الختمة مؤرشفة، فلا يمكن تغييرها.");
  return k as Khatma & { rota: RotaState };
}

function write(
  id: string,
  next: (rota: RotaState) => RotaState,
  label: string,
  via?: Via,
  note?: string | null,
  patch: (db: Db) => Db = (db) => db,
) {
  const k = current(id);
  const rota = next(k.rota);
  change(
    (d) => patch({ ...d, khatmas: d.khatmas.map((x) => (x.id === id ? { ...x, rota } : x)) }),
    { action: "تعديل ختمة بالتناوب", targetKind: "khatma", targetId: id, targetLabel: k.name, before: null, after: label, note: note ?? null },
    via,
  );
}

function setRead(rota: RotaState, juz: number, patch: Partial<RotaRead>): RotaState {
  return { ...rota, today: rota.today.map((r) => (r.juz === juz ? { ...r, ...patch } : r)) };
}

/** Today's holder of each juz' follows the slots, unless someone was assigned it. */
function retitle(rota: RotaState): RotaState {
  return {
    ...rota,
    today: rota.today.map((r) => {
      if (r.doneAt !== null || r.reassigned) return r;
      const owner = rota.slots[slotOfJuz(r.juz, rota.number) - 1];
      return { ...r, holderId: owner, readerId: owner };
    }),
  };
}

export function markDone(id: string, juz: number, via?: Via) {
  write(id, (r) => setRead(r, juz, { doneAt: Date.now(), doneByOrganizer: true }), `الجزء ${ar(juz)}: سُجّل تامّاً`, via);
}

export function markNotDone(id: string, juz: number, via?: Via) {
  write(id, (r) => setRead(r, juz, { doneAt: null, doneByOrganizer: false }), `الجزء ${ar(juz)}: أُلغي التسجيل`, via);
}

export function reassign(id: string, juz: number, participantId: string, via?: Via) {
  const name = participantName(current(id).rota, participantId);
  if (!name) throw new Error("لم نجد هذا الشخص.");
  write(id, (r) => setRead(r, juz, { readerId: participantId, reassigned: true, notYet: false }), `الجزء ${ar(juz)}: أُسند إلى ${name}`, via);
}

export function moveSlot(id: string, participantId: string, from: number, to: number) {
  const { rota } = current(id);
  const other = rota.slots[to - 1];
  write(
    id,
    (r) => {
      const slots = [...r.slots];
      slots[from - 1] = other;
      slots[to - 1] = participantId;
      return retitle({ ...r, slots });
    },
    `نقل ${participantName(rota, participantId)}${other ? ` وتبادل مع ${participantName(rota, other)}` : ""}`,
  );
}

export function giveSlot(id: string, participantId: string, slot: number) {
  const { rota } = current(id);
  if (rota.slots[slot - 1] !== null) throw new Error("هذا الجزء له قارئ الآن.");
  if (slotsOf(rota, participantId).length >= maxSlots()) throw new Error("لا يمكنه أن يقرأ أكثر من هذا.");
  write(
    id,
    (r) => {
      const slots = [...r.slots];
      slots[slot - 1] = participantId;
      return retitle({ ...r, slots });
    },
    `أُعطي ${participantName(rota, participantId)} جزءاً`,
  );
}

export function freeSlot(id: string, slot: number) {
  write(
    id,
    (r) => {
      const slots = [...r.slots];
      slots[slot - 1] = null;
      return retitle({ ...r, slots });
    },
    "أصبح جزء بلا قارئ",
  );
}

export function addParticipant(id: string, person: { name: string; phone: string; personId?: string | null }, slot: number) {
  const { rota } = current(id);
  if (rota.participants.some((p) => p.phone === person.phone)) throw new Error("هذا الرقم مضاف في الختمة.");
  if (rota.slots[slot - 1] !== null) throw new Error("هذا الجزء له قارئ. حاول مرة أخرى.");
  const added: RotaParticipant = { id: `rp${Date.now()}`, name: person.name, phone: person.phone, personId: person.personId ?? null, joinedAt: null, stoppedAt: null, silencedAt: null, silentDays: 0 };
  write(
    id,
    (r) => {
      const slots = [...r.slots];
      slots[slot - 1] = added.id;
      return retitle({ ...r, participants: [...r.participants, added], slots });
    },
    `أُضيف ${person.name}`,
  );
}

export function removeParticipant(id: string, participantId: string) {
  const { rota } = current(id);
  const name = participantName(rota, participantId);
  write(
    id,
    (r) =>
      retitle({
        ...r,
        participants: r.participants.filter((p) => p.id !== participantId),
        slots: r.slots.map((s) => (s === participantId ? null : s)),
      }),
    `أُزيل ${name}`,
  );
}

export function acceptRequest(id: string, requestId: string, slot: number) {
  const { rota } = current(id);
  const request = rota.joinRequests.find((r) => r.id === requestId);
  if (!request) throw new Error("لم نجد هذا الطلب.");
  if (rota.slots[slot - 1] !== null) throw new Error("هذا الجزء له قارئ الآن. اختر جزءاً آخر.");
  const added: RotaParticipant = { id: `rp${Date.now()}`, name: request.name ?? request.phone, phone: request.phone, personId: null, joinedAt: Date.now(), stoppedAt: null, silencedAt: null, silentDays: 0 };
  write(
    id,
    (r) => {
      const slots = [...r.slots];
      slots[slot - 1] = added.id;
      return retitle({ ...r, participants: [...r.participants, added], slots, joinRequests: r.joinRequests.filter((x) => x.id !== requestId) });
    },
    `قُبل طلب ${added.name}`,
  );
}

export function declineRequest(id: string, requestId: string) {
  const { rota } = current(id);
  const request = rota.joinRequests.find((r) => r.id === requestId);
  write(id, (r) => ({ ...r, joinRequests: r.joinRequests.filter((x) => x.id !== requestId) }), `رُفض طلب ${request?.name ?? request?.phone}`);
}

export function setMessages(id: string, messages: RotaMessages) {
  const order = [messages.dayAt, ...[messages.reminder, messages.unread, messages.summary].filter((m) => m.on).map((m) => m.at)];
  if (order.some((at, i) => i > 0 && at <= order[i - 1])) {
    throw new Error("رتّب الأوقات: رسالة الجزء أولاً، ثم التذكير، ثم الأجزاء غير المقروءة، ثم الملخص.");
  }
  write(id, (r) => ({ ...r, messages }), "تعديل أوقات الرسائل");
}

export function setEndDate(id: string, endDate: string | null) {
  write(id, (r) => ({ ...r, endDate }), "تعديل تاريخ النهاية");
}

export function setPaused(id: string, paused: boolean, via?: Via) {
  write(
    id,
    (r) => ({ ...r, pausedAt: paused ? Date.now() : null }),
    paused ? "إيقاف الختمة" : "إعادة تشغيل الختمة",
    via,
    null,
    (db) => ({ ...db, khatmas: db.khatmas.map((k) => (k.id === id ? { ...k, status: paused ? "paused" : "active" } : k)) }),
  );
}

export function addPauseDate(id: string, date: string) {
  if (current(id).rota.pauseDates.includes(date)) throw new Error("هذا اليوم مضاف.");
  write(id, (r) => ({ ...r, pauseDates: [...r.pauseDates, date].sort() }), "إضافة يوم توقف");
}

export function removePauseDate(id: string, date: string) {
  write(id, (r) => ({ ...r, pauseDates: r.pauseDates.filter((d) => d !== date) }), "إزالة يوم توقف");
}

export function finishSetup(id: string) {
  write(id, (r) => ({ ...r, setupDone: true }), "بدأت الختمة");
}
