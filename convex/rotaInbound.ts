import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { notify } from "./notes";
import { celebrateIfComplete, completeIfDone } from "./rotaDays";
import { onStaging, titled } from "./rotaOutbox";
import { findJoinCode } from "./lib/rotaJoin";
import { decodePayload, encodePayload } from "./lib/rotaPayload";
import { lastRotaDay, targetDay } from "./lib/rotaPlace";
import { classifyReply } from "./lib/rotaReplies";
import {
  ROTA_BUTTONS,
  alreadyText,
  clockText,
  closedText,
  duaText,
  helpText,
  juzText,
  notOnListText,
  notYetText,
  stopText,
  thanksText,
  weekdayText,
  welcomeText,
  whichKhatmaText,
} from "./lib/rotaTemplates";
import { maskPhone } from "./lib/text";
import { localDate, localMinutes } from "./lib/wakingTime";
import { khatmaTitle } from "./lib/whatsappTemplates";

/**
 * A rota member's WhatsApp messages to Wirdak: their join message, their taps
 * on a message's buttons, and their typed replies. The replies go out at once
 * from the inbound action, since they answer the member's own message.
 */

type Participant = Doc<"rotaParticipants">;
type Khatma = Doc<"khatmas">;
type Day = Doc<"rotaDays">;
type RotaConfig = NonNullable<Khatma["rota"]>;

export type InboundReply = {
  kind: "reply";
  text: string;
  buttons?: { id: string; title: string }[];
};
/** The replies to send, in order, or `none` when the message isn't a rota one. */
export type InboundResult = { kind: "none" } | InboundReply[];

const NONE = { kind: "none" } as const;

function reply(text: string, buttons?: InboundReply["buttons"]): InboundReply {
  return buttons ? { kind: "reply", text, buttons } : { kind: "reply", text };
}

/** A reply about one khatma, under its title in bold like every free-form rota message. */
const about = (khatma: Khatma, text: string) => reply(titled(khatma, text));

const isActive = (p: Participant) => p.removedAt == null;
const hasJoined = (p: Participant) => isActive(p) && p.joinedAt != null;

/**
 * Opens the phone's 24-hour window and counts the message as a reply from
 * each of its participants, which resets the silence count and turns
 * messages a silence stopped back on. Returns the phone's active participants.
 */
async function recordReply(
  ctx: MutationCtx,
  phone: string,
  now: number,
): Promise<Participant[]> {
  const contact = await ctx.db
    .query("waContacts")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
  if (contact) {
    await ctx.db.patch(contact._id, { lastInboundAt: now });
  } else {
    await ctx.db.insert("waContacts", { phone, lastInboundAt: now });
  }
  const rows = await ctx.db
    .query("rotaParticipants")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .collect();
  const active = rows.filter(isActive);
  for (const p of active) {
    await ctx.db.patch(p._id, {
      lastReplyAt: now,
      silentDays: 0,
      silencedAt: null,
    });
  }
  return active;
}

/** The participant's reads of a day. */
function readsOf(ctx: MutationCtx, participant: Participant, day: Day) {
  return ctx.db
    .query("rotaReads")
    .withIndex("by_reader_day", (q) =>
      q.eq("readerId", participant._id).eq("dayId", day._id),
    )
    .collect();
}

/** The day's reminder time, when it is on and still ahead today. */
function reminderAhead(rota: RotaConfig, day: Day, now: number): string | null {
  const { reminder } = rota.messages;
  if (!reminder.on || day.reminderSentAt != null || rota.pausedAt !== null) {
    return null;
  }
  if (day.date !== localDate(now, rota.timeZone)) return null;
  if (localMinutes(now, rota.timeZone) >= reminder.at) return null;
  return clockText(reminder.at);
}

/**
 * «أتممت» or «ليس بعد» for one participant's reads of one day. «أتممت» marks
 * all of them done (two slots, one tap); the tap that completes the day
 * brings the dua with the thanks, and everyone else gets the completion
 * message. Changes nothing on a closed day or with nothing left to read.
 */
async function answerDay(
  ctx: MutationCtx,
  khatma: Khatma,
  participant: Participant,
  day: Day,
  action: "done" | "notYet",
  now: number,
): Promise<InboundReply[]> {
  const rota = khatma.rota;
  if (!rota || day.closedAt !== null) return [about(khatma, closedText)];
  const unread = (await readsOf(ctx, participant, day)).filter(
    (r) => r.doneAt === null,
  );
  if (unread.length === 0) return [about(khatma, alreadyText)];
  if (action === "notYet") {
    for (const r of unread) await ctx.db.patch(r._id, { notYetAt: now });
    return [about(khatma, notYetText(reminderAhead(rota, day, now)))];
  }
  for (const r of unread) {
    await ctx.db.patch(r._id, { doneAt: now, doneByOrganizer: false });
  }
  const reads = await ctx.db
    .query("rotaReads")
    .withIndex("by_day_juz", (q) => q.eq("dayId", day._id))
    .collect();
  const done = reads.filter((r) => r.doneAt !== null).length;
  const replies = [about(khatma, thanksText(done))];
  if (await completeIfDone(ctx, day._id)) {
    await celebrateIfComplete(ctx, day._id, participant._id);
    replies.push(about(khatma, duaText()));
  }
  return replies;
}

/**
 * A tap on a rota message's button. The payload names a day and a
 * participant, and only that participant's own phone may act on it: from any
 * other phone nothing changes. A tap on another deployment's message is
 * left for the relay.
 */
async function answerTap(
  ctx: MutationCtx,
  phone: string,
  payload: string,
  now: number,
): Promise<InboundResult> {
  const decoded = decodePayload(payload);
  if (decoded === null || decoded.staging !== onStaging()) return NONE;
  const participantId = ctx.db.normalizeId(
    "rotaParticipants",
    decoded.participantId,
  );
  const participant = participantId ? await ctx.db.get(participantId) : null;
  if (!participant || participant.phone !== phone || !isActive(participant)) {
    return [reply(helpText)];
  }
  const khatma = await ctx.db.get(participant.khatmaId);
  if (!khatma) return [reply(helpText)];
  if (decoded.action === "dua") return [about(khatma, duaText())];
  const dayId = ctx.db.normalizeId("rotaDays", decoded.dayId);
  const day = dayId ? await ctx.db.get(dayId) : null;
  if (!day || day.khatmaId !== participant.khatmaId) return [reply(helpText)];
  return await answerDay(ctx, khatma, participant, day, decoded.action, now);
}

/** The reply to a listed member's join message: today's juz' if a day of theirs is open, else when the next one comes. */
async function welcome(
  ctx: MutationCtx,
  khatma: Khatma,
  rota: RotaConfig,
  participant: Participant,
  now: number,
): Promise<InboundReply> {
  const title = khatmaTitle(khatma);
  const last = await lastRotaDay(ctx, khatma._id);
  if (
    last &&
    last.closedAt === null &&
    last.date === localDate(now, rota.timeZone)
  ) {
    const juz = (await readsOf(ctx, participant, last))
      .filter((r) => r.doneAt === null)
      .map((r) => r.juz)
      .sort((a, b) => a - b);
    if (juz.length > 0) {
      const ids = { dayId: last._id, participantId: participant._id };
      const text = `${welcomeText(participant.name, title, null)}\n${juzText(last.number, juz)}`;
      return reply(titled(khatma, text), [
        {
          id: encodePayload({ action: "done", ...ids }, onStaging()),
          title: ROTA_BUTTONS.done,
        },
        {
          id: encodePayload({ action: "notYet", ...ids }, onStaging()),
          title: ROTA_BUTTONS.notYet,
        },
      ]);
    }
  }
  const target = await targetDay(ctx, khatma);
  const next =
    target.date === null
      ? null
      : {
          weekday: weekdayText(target.date),
          time: clockText(rota.messages.dayAt),
        };
  return about(khatma, welcomeText(participant.name, title, next));
}

/**
 * A join message for a khatma that takes joins (rota, not archived), or null
 * when this deployment has no such khatma. A listed phone joins (or rejoins
 * after «إيقاف»); any other phone files one open join request, and the
 * organizer is told once. A join never signs anyone in.
 */
async function join(
  ctx: MutationCtx,
  args: { phone: string; profileName?: string; now: number },
  code: string,
): Promise<InboundReply[] | null> {
  const khatma = await ctx.db
    .query("khatmas")
    .withIndex("by_joinCode", (q) => q.eq("joinCode", code))
    .first();
  const rota = khatma?.rota;
  if (!khatma || khatma.kind !== "rota" || !rota || rota.archivedAt !== null) {
    return null;
  }
  const rows = await ctx.db
    .query("rotaParticipants")
    .withIndex("by_khatma_phone", (q) =>
      q.eq("khatmaId", khatma._id).eq("phone", args.phone),
    )
    .collect();
  const participant = rows.find(isActive);
  if (!participant) {
    const requests = await ctx.db
      .query("rotaJoinRequests")
      .withIndex("by_khatma_phone", (q) =>
        q.eq("khatmaId", khatma._id).eq("phone", args.phone),
      )
      .collect();
    if (!requests.some((r) => r.resolvedAt === null)) {
      const profileName = args.profileName ? args.profileName : null;
      await ctx.db.insert("rotaJoinRequests", {
        khatmaId: khatma._id,
        phone: args.phone,
        profileName,
        createdAt: args.now,
        resolvedAt: null,
        outcome: null,
      });
      await notify(ctx, {
        personId: khatma.creatorPersonId,
        khatmaId: khatma._id,
        kind: "rotaJoinRequest",
        name: profileName ?? maskPhone(args.phone),
      });
    }
    return [about(khatma, notOnListText)];
  }
  const person =
    participant.personId === null
      ? await ctx.db
          .query("people")
          .withIndex("by_phone", (q) => q.eq("phone", args.phone))
          .first()
      : null;
  const joined: Participant = {
    ...participant,
    joinedAt: participant.joinedAt ?? args.now,
    stoppedAt: null,
    ...(person && { personId: person._id }),
  };
  await ctx.db.patch(participant._id, {
    joinedAt: joined.joinedAt,
    stoppedAt: null,
    personId: joined.personId,
  });
  return [await welcome(ctx, khatma, rota, joined, args.now)];
}

/** «إيقاف»: stops every khatma's messages for the phone and tells each organizer. */
async function stop(
  ctx: MutationCtx,
  joined: Participant[],
  now: number,
): Promise<InboundReply[]> {
  for (const p of joined) {
    if (p.stoppedAt != null) continue;
    await ctx.db.patch(p._id, { stoppedAt: now });
    const khatma = await ctx.db.get(p.khatmaId);
    if (!khatma) continue;
    await notify(ctx, {
      personId: khatma.creatorPersonId,
      khatmaId: khatma._id,
      kind: "rotaStopped",
      name: p.name,
    });
  }
  return [reply(stopText)];
}

/**
 * A typed «تم» or «ليس بعد». It acts only when exactly one open day has
 * unread reads for the phone; with several, the reply asks which khatma,
 * with one button per khatma, and changes nothing.
 */
async function answerTyped(
  ctx: MutationCtx,
  joined: Participant[],
  action: "done" | "notYet",
  now: number,
): Promise<InboundReply[]> {
  const open: { participant: Participant; khatma: Khatma; day: Day }[] = [];
  let anyRead = false;
  for (const participant of joined) {
    const day = await lastRotaDay(ctx, participant.khatmaId);
    if (!day || day.closedAt !== null) continue;
    const reads = await readsOf(ctx, participant, day);
    if (reads.length === 0) continue;
    anyRead = true;
    if (!reads.some((r) => r.doneAt === null)) continue;
    const khatma = await ctx.db.get(participant.khatmaId);
    if (khatma) open.push({ participant, khatma, day });
  }
  if (open.length === 1) {
    const [{ participant, khatma, day }] = open as [(typeof open)[number]];
    return await answerDay(ctx, khatma, participant, day, action, now);
  }
  if (open.length === 0) return [reply(anyRead ? alreadyText : helpText)];
  return [
    reply(
      whichKhatmaText,
      open.map(({ participant, khatma, day }) => ({
        id: encodePayload(
          { action, dayId: day._id, participantId: participant._id },
          onStaging(),
        ),
        title: khatmaTitle(khatma),
      })),
    ),
  ];
}

/**
 * One incoming WhatsApp message that no sign-in code took. Every message
 * first opens the phone's window and counts as a reply. Then, in order: a
 * button tap, a join message, and a typed reply from a phone with joined
 * participants. `none` means it isn't a rota message here (a phone with no
 * participant, or a join code or a tap this deployment doesn't have).
 */
export const handle = internalMutation({
  args: {
    phone: v.string(),
    text: v.string(),
    payload: v.optional(v.string()),
    profileName: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<InboundResult> => {
    const active = await recordReply(ctx, args.phone, args.now);
    if (args.payload !== undefined) {
      return await answerTap(ctx, args.phone, args.payload, args.now);
    }
    const code = findJoinCode(args.text);
    if (code !== null) return (await join(ctx, args, code)) ?? NONE;
    const joined = active.filter(hasJoined);
    if (joined.length === 0) return NONE;
    const word = classifyReply(args.text);
    switch (word) {
      case "stop":
        return await stop(ctx, joined, args.now);
      case "done":
      case "notYet":
        return await answerTyped(ctx, joined, word, args.now);
      case "dua":
        return [reply(duaText())];
      case null:
        return [reply(helpText)];
    }
  },
});
