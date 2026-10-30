# Rotating khatma, plan 2: members on WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members of a rotating khatma take part through WhatsApp alone. They join with one tap, get their juz' each reading day with «أتممت» / «ليس بعد» buttons and a reminder, are told when their juz' is reassigned, and receive the khatm dua when the khatma is complete. The organizer sees who joined, who answered, and join requests.

**Architecture:** Inbound messages get a third route after sign-in codes: join codes, then rota replies (button payloads or typed words from a known participant phone). Outbound messages go through a `rotaOutbox` table. Each row is one message to one participant, and a `deliver` action sends it once, after quiet hours, as an approved template or, inside the 24-hour window, as a free-form message. The engine from plan 1 (`convex/rotaDays.ts` `tick`, `startDay`, `completeIfDone`) and the organizer mutations (`rota.reassign`, `rota.markDone`) enqueue the messages. Replies to a member's own message are sent at once from the inbound action.

**Tech Stack:** Convex (convex-test + vitest), WhatsApp Cloud API (Graph), React 19 + Tailwind 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-wirdak-rotating-khatma-design.md` sections 4, 5, 6.3, 6.4, 7 and 8 (privacy page only). Plan 1 (`docs/superpowers/plans/2026-10-29-wirdak-rota-1-core.md`) is merged into this branch's base.

## Global Constraints

- Everything from plan 1's Global Constraints still holds: pool behavior unchanged, `rota` naming, Arabic copy in `apps/web/src/i18n/ar.ts` or the convex text modules, no new dependencies, `bun run typecheck && bun run lint && bun run test` green after every task, Conventional Commits with `Refs: ARQ-287`, **no AI attribution of any kind**.
- **Opt-in:** a participant gets business-started messages only after their own join message (`joinedAt !== null`), and never after «إيقاف» (`stoppedAt !== null`) or after Wirdak stopped them for silence (`silencedAt !== null`).
- **Quiet hours:** every business-started message waits until quiet hours end in the khatma's time zone (`nextAwake`). A reply to the member's own message goes out at once.
- **24-hour window:** a phone's window is open when `waContacts.lastInboundAt >= now - 24h`. Inside it, free-form text or interactive messages are allowed. Outside it, only approved templates.
- **Templates** are UTILITY, `ar`, and plain status updates: no prayers, questions, invitations or footers, and link tracking off (memory: Meta marked those MARKETING). The dua is never in a template. It goes as free-form text inside the window, or behind the completion template's «دعاء الختم» button.
- **Logs** never contain phone numbers, names or message bodies in prod (follow `postMessage`).
- **Staging** shares production's number: anything production can't place (an unknown join code, a payload marked for staging, or a typed reply from a phone that isn't a rota participant on production) is relayed to staging the way unknown sign-in codes are.

## Review Focus

1. **A button tap from the wrong phone, or for a closed day.** The payload names a day and a participant. The sender's phone must match that participant. If not, or the day is closed, nothing changes and the member gets a short reply. Test: participant B's phone sends A's payload, and A's reads stay unread (Task 6).
2. **Two open khatmas, one typed «تم».** The reply offers one button per khatma and changes nothing until one is tapped. Test (Task 6).
3. **Double sends.** A retried `deliver` or a second tick never sends the same message twice, and the dua goes out once per day even after `markNotDone` then `markDone`. Test (Tasks 4 and 5).
4. **Silence counter.** Any inbound message from the participant resets it. Only days on which they held a read count. Test (Task 5).
5. **Join codes vs sign-in codes.** A sign-in message never joins a khatma, and a join message never signs anyone in. Test (Task 6).

---

### Task 1: Data for joining, replies and outbound messages

**Files:** Modify `convex/schema.ts`, `convex/lib/rota.ts` (config), `convex/rota.ts` (create sets the join code), `convex/lib/noteText.ts`, `convex/lib/whatsappTemplates.ts` (null entries for now), `apps/web/src/components/NoteCard.tsx` if needed. Test: `convex/schema.test.ts`, `convex/rota.create.test.ts`, `convex/lib/noteText.test.ts`.

**Produces:**
- `khatmas.joinCode: v.optional(v.string())` with index `by_joinCode`. `rota.create` draws a 6-character code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`randomJoinCode()` in new `convex/lib/rotaJoin.ts`) and retries on a collision, like the invite code. A rota khatma without one gets one lazily: export `ensureJoinCode(ctx, khatma): Promise<string>` from `convex/rota.ts` for mutations.
- `rotaParticipants` gains, all optional (missing = null or 0): `joinedAt`, `stoppedAt`, `silencedAt`, `lastReplyAt` (numbers or null), and `silentDays` (number).
- `rotaDays` gains, optional: `reminderSentAt`, `celebratedAt`.
- `rotaReads` gains, optional: `notYetAt`.
- New table `rotaJoinRequests`: `{ khatmaId, phone, profileName: string | null, createdAt, resolvedAt: number | null, outcome: "accepted" | "declined" | null }`, indexes `by_khatma_open` `["khatmaId", "resolvedAt"]` and `by_khatma_phone` `["khatmaId", "phone"]`.
- New table `waContacts`: `{ phone, lastInboundAt }`, index `by_phone`.
- New table `rotaOutbox`: `{ khatmaId, participantId, dayId: Id<"rotaDays"> | null, kind: "juz" | "reminder" | "assigned" | "covered" | "complete" | "cycle", juz: number[], number: number | null, createdAt, sentAt: number | null, skippedAt: number | null }`, indexes `by_day_kind_participant` `["dayId", "kind", "participantId"]` and `by_createdAt`.
- `notes.name: v.optional(v.union(v.string(), v.null()))` for a participant's name in an organizer note. New note kinds: `rotaJoinRequest` (name = profile name or the phone masked with `maskPhone`), `rotaSilent` (name, count = days), `rotaSilenced` (name), `rotaStopped` (name). `noteText`: «طلب انضمام من ${name}.», «لم يردّ ${name} منذ ${count} أيام.» (count with `arabicCount`), «أوقفنا رسائل الختمة إلى ${name} لأنه لم يردّ منذ مدة.», «أوقف ${name} رسائل الختمة.». `notify` takes an optional `name`.

- [ ] **Step 1:** Failing tests: the schema accepts the new fields and tables; `create` stores a 6-character join code from the alphabet; two creates get different codes; the new note texts render with Arabic digits.
- [ ] **Step 2:** Run them and see them fail. Implement. Run `bun run typecheck && bun run lint && bun run test` → pass.
- [ ] **Step 3:** Commit `feat(convex): store rota join codes, replies and outbound messages`.

### Task 2: WhatsApp primitives (pure where possible)

**Files:** Modify `convex/whatsapp.ts`, `convex/lib/whatsappTemplates.ts`. Create `convex/lib/rotaJoin.ts` (from Task 1, extend), `convex/lib/rotaReplies.ts`, `convex/lib/rotaPayload.ts`. Test: `convex/whatsapp.test.ts`, `convex/lib/rotaJoin.test.ts`, `convex/lib/rotaReplies.test.ts`, `convex/lib/rotaPayload.test.ts`.

**Produces:**
- `IncomingMessage` gains `payload?: string` and `profileName?: string`. `parseIncoming` also reads:
  - template quick-reply taps (`type: "button"`: `payload = m.button.payload`, `text = m.button.text`)
  - interactive reply-button taps (`type: "interactive"`, `interactive.type === "button_reply"`: `payload = button_reply.id`, `text = button_reply.title`)
  - the sender's `value.contacts[].profile.name`, matched on `wa_id`, cut to 60 characters
  
  `parseRelayed` carries `payload` (≤ 256 chars) and `profileName`.
- `TemplateMessage` gains `quickReplies?: string[]` (button index `i` → `{ type: "button", sub_type: "quick_reply", index: String(i), parameters: [{ type: "payload", payload }] }`).
- `sendWhatsAppButtons(to, body, buttons: { id: string; title: string }[]): Promise<boolean>`: interactive `button` message with up to 3 buttons, titles ≤ 20 chars. `describeMessage` prints buttons as `[title] id`.
- `rotaPayload.ts`: `encodePayload(p: { action: "done" | "notYet" | "dua"; dayId: string; participantId: string }, staging: boolean): string` → `r1|<s or p>|<action>|<dayId>|<participantId>`. `decodePayload(s): (… & { staging: boolean }) | null`.
- `rotaJoin.ts`: `joinText(title: string, code: string): string` → `انضمام إلى ${title} · ${code}`. `findJoinCode(text): string | null` returns the 6-character code only when the text contains «انضمام» and a token from the alphabet, normalizing digits. `joinLink(publicNumber: string, title: string, code: string): string` → `https://wa.me/<digits>?text=<encodeURIComponent(joinText)>`.
- `rotaReplies.ts`: `classifyReply(text): "done" | "notYet" | "stop" | "dua" | null`. It normalizes Arabic: strips diacritics and tatweel, unifies alef forms and ة/ه at the end, and lowercases Latin. Lists [plan's call]:
  - done: تم، تمت، أتممت، اتممت، خلصت، قرأت، قرأته، الحمد لله تم، done, ✅, 👍
  - notYet: ليس بعد، بعد، لا بعد، بعدين، لاحقا، مو بعد، not yet
  - stop: إيقاف، ايقاف، أوقف، stop
  - dua: دعاء الختم، الدعاء
  
  A message matches when its whole normalized text, or its first word for done/stop, is in the list.
- `whatsappTemplates.ts`: export the existing `cleanParam` / `khatmaTitle` / `buttonSuffix` for reuse (already exported).

- [ ] **Step 1:** Failing tests:
  - a webhook payload with a `button` and an `interactive.button_reply` message parses to text, payload and profileName
  - `parseRelayed` round-trips payload
  - a template with quick replies builds the Graph components above
  - `sendWhatsAppButtons` builds an interactive button payload
  - payload encode and decode round-trip, and garbage decodes to null
  - `findJoinCode("انضمام إلى ختمة العائلة · K7Q2MX")` is `"K7Q2MX"`, a sign-in message is null, and text without «انضمام» is null
  - `classifyReply` for each list, with diacritics and Latin case, and «السلام عليكم» → null
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(convex): parse WhatsApp button replies and add rota payload, join and reply helpers`.

### Task 3: Rota templates and free-form texts

**Files:** Create `convex/lib/rotaTemplates.ts`, `docs/whatsapp-rota-templates.md`. Modify `convex/lib/whatsappTemplates.ts` (`NOTE_TEMPLATES` for the organizer kinds). Test: `convex/lib/rotaTemplates.test.ts`, `convex/lib/whatsappTemplates.test.ts`.

**Produces** (`rotaTemplates.ts`). Each template has header `{{1}}` = `khatmaTitle(khatma)`:

| Constant | Name | Body (`{{n}}`) | Buttons |
| --- | --- | --- | --- |
| `ROTA_JUZ` | `wirdak_rota_juz` | `الختمة {{1}} اليوم. جزؤك: {{2}}.` | quick replies «أتممت», «ليس بعد» |
| `ROTA_REMINDER` | `wirdak_rota_reminder` | `تذكير بقراءتك اليوم: {{1}} لم يُسجَّل بعد.` | «أتممت», «ليس بعد» |
| `ROTA_ASSIGNED` | `wirdak_rota_assigned` | `تحديث على قراءتك: أُسند إليك {{1}} في الختمة {{2}} اليوم.` | «أتممت», «ليس بعد» |
| `ROTA_COVERED` | `wirdak_rota_covered` | `تحديث على قراءتك: قُرئ {{1}} عنك اليوم، فلم يعد عليك.` | none |
| `ROTA_COMPLETE` | `wirdak_rota_complete` | `تحديث على الختمة: اكتملت قراءة الأجزاء الثلاثين في الختمة {{1}}.` | quick reply «دعاء الختم» |
| `ROTA_CYCLE` | `wirdak_rota_cycle` | `تحديث على قراءتك: أكملت ثلاثين جزءاً في ثلاثين ختمة، أي القرآن كاملاً.` | none |

- `{{1}}` / `{{2}}` juz' text: «الجزء ٢٦», or «الجزآن ٥ و٦» / «الأجزاء ٣، ٥ و٦» (build on `juzList`).
- Builders: `juzTemplate(khatma, juz: number[], number: number, payloads: { done: string; notYet: string })`, `reminderTemplate(...)`, `assignedTemplate(...)`, `coveredTemplate(khatma, juz)`, `completeTemplate(khatma, number, duaPayload)`, `cycleTemplate(khatma)`, all returning `TemplateMessage`.
- Free-form texts, which carry the same buttons as interactive reply buttons when sent in the window:
  - `welcomeText(name, title, next: { weekday: string; time: string } | null)`: «أهلاً ${name}، انضممت إلى ${title}. تصلك رسالة جزئك ${يوم … الساعة …}.»
  - `juzText(number, juz)`
  - `thanksText(doneCount)`: «تقبّل الله منك. ${doneCount} من ٣٠ جزءاً تمّت اليوم.»
  - `notYetText(reminderTime | null)`: «لا بأس، نذكّرك الساعة ٤ عصراً.» / «لا بأس.»
  - `alreadyText`: «سجّلنا قراءتك من قبل.»
  - `closedText`: «انتهى يوم هذه الختمة.»
  - `notOnListText`: «أرسلنا طلبك إلى منظّم الختمة، ونخبرك حين يضيفك.»
  - `stopText`: «أوقفنا رسائل الختمة لك. لتعود إليها أرسل رسالة الانضمام مرة أخرى.»
  - `helpText`: «اضغط «أتممت» أو «ليس بعد» في رسالة جزئك.»
  - `whichKhatmaText`: «لأي ختمة؟»
  - `duaText()`: the two duas from `apps/web/src/i18n/ar.ts` `t.celebration.duas`. Move them to a convex text module both import, verbatim; the Tanzil comment stays.
- `NOTE_TEMPLATES`: `rotaUnread` → `wirdak_rota_unread` («تحديث على الختمة التي تنظّمها: {{1}} لم يُسجَّل بعد اليوم.»), `rotaSummary` → `wirdak_rota_summary` («تحديث على الختمة التي تنظّمها: تمّت قراءة {{1}} من ٣٠ جزءاً اليوم.»), `rotaJoinRequest` → `wirdak_rota_join_request` («تحديث على الختمة التي تنظّمها: طلب انضمام جديد من {{1}}.»), `rotaSilent`, `rotaSilenced` and `rotaStopped` → `null` (in-app and push only) [plan's call]. Each has the usual «افتح الختمة» URL button.
- `docs/whatsapp-rota-templates.md`: every template above with category, language, header, body, sample values and buttons, ready to submit, plus the rule "link tracking off".

- [ ] **Step 1:** Failing tests: each builder's name, header, body params and quick-reply payload order; the juz' text forms for 1, 2 and 3 ajza'; the free texts with Arabic digits; the dua text equals the celebration page's duas (same source).
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(convex): rota WhatsApp templates and replies`.

### Task 4: The outbox and delivery

**Files:** Create `convex/rotaOutbox.ts`. Test: `convex/rotaOutbox.test.ts`.

**Produces:**
- `enqueue(ctx: MutationCtx, row: { khatmaId; participantId; dayId; kind; juz; number }): Promise<Id<"rotaOutbox"> | null>`. It inserts a row unless one exists with the same `(dayId, kind, participantId)` (null days never dedupe), then schedules `internal.rotaOutbox.deliver({ outboxId })` at `nextAwake(now, rota.timeZone, quietHours)`. It returns null without inserting when the participant isn't joined, has stopped, or is silenced.
- `plan` (internalQuery `{ outboxId }`) → `null` (skip: already sent or skipped; participant not joined, stopped or silenced; khatma archived; for juz/reminder/assigned, the day is closed or every listed read is done), `{ retryAt }` (quiet hours now), or `{ phone, message: TemplateMessage | { text: string; buttons?: {id,title}[] } }`. The window decides the form: open → free-form; closed → template. Payloads come from `encodePayload` with `staging = siteUrl() === "https://stg.wirdak.app"`.
- `markSent` / `markSkipped` (internalMutation).
- `deliver` (internalAction): plan, then retry, skip, or mark sent and then send (like `whatsappNotes.deliver`: marked before sending, never sent twice, not retried on failure).
- `sendSample` (internalAction, staging and dev only, like `whatsappNotes.sendSample`): sends each rota template to a phone with sample values, for the staging check.

- [ ] **Step 1:** Failing tests (stub `fetch` like `convex/whatsappNotes.test.ts`):
  - enqueue skips a participant who hasn't joined
  - the same `(day, kind, participant)` enqueued twice makes one row
  - during quiet hours deliver reschedules
  - inside the window a juz' message goes as interactive buttons, outside it as the `wirdak_rota_juz` template with quick-reply payloads
  - a reminder for reads already done is skipped
  - a retried deliver sends once
  - a stopped participant is skipped
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(convex): send rota WhatsApp messages once, after quiet hours`.

### Task 5: Engine hooks: juz', reminder, reassign, dua, silence, cycle

**Files:** Modify `convex/rotaDays.ts`, `convex/rota.ts`. Test: `convex/rotaDays.test.ts`, `convex/rota.today.test.ts`, new `convex/rotaWhatsApp.engine.test.ts`.

**Produces:**
- `startDay` enqueues one `juz` row per joined reader, with all of their juz' for the day in one row.
- `tick`: when `reminder.on`, `minutes >= reminder.at`, the day is open and dated today, not paused, and `reminderSentAt` is unset, it enqueues a `reminder` for each joined reader with unread reads (`notYetAt` or none), then stamps `reminderSentAt`.
- `rota.reassign` enqueues `assigned` to the new reader (juz'), and `covered` to the holder when the holder isn't the new reader. A dayless dedupe doesn't apply: `dayId` is set.
- `celebrateIfComplete(ctx, dayId, exceptParticipantId?)` (in `rotaDays.ts`): when `completedAt` is set and `celebratedAt` is unset, it stamps `celebratedAt` and enqueues `complete` for every joined participant except `exceptParticipantId`. In the window, `plan` sends `duaText()` free-form. Outside it, the `complete` template. It is called after `completeIfDone` returns true in `rota.markDone`, and from the inbound done path (Task 6), which passes the tapping participant (that one gets the dua in its reply).
- Day close (in `tick`, where `closedAt` is set): for each joined, unstopped participant who held a read that day, set `silentDays = lastReplyAt >= day.startedAt ? 0 : silentDays + 1`. When it reaches `rotaSilenceNoticeDays`, notify the organizer `rotaSilent` (name, count). At `rotaSilenceStopDays`, set `silencedAt = now` and notify `rotaSilenced`.
- Cycle: when a day with `number === 30` closes, enqueue `cycle` for each joined participant who held a slot for that whole cycle (`joinedAt <= first day of the cycle's startedAt`) [plan's call].

- [ ] **Step 1:** Failing tests:
  - a started day enqueues one juz' row for a joined two-slot reader and none for a not-joined one
  - the reminder goes once, only to readers with unread reads
  - reassign enqueues assigned and covered
  - completing by organizer markDone enqueues complete for all joined participants once, and markNotDone then markDone doesn't enqueue again (**Review Focus 3**)
  - silence: 3 silent days notify the organizer once, 7 silence the participant, and a reply resets the counter (**Review Focus 4**)
  - a number-30 day closing enqueues cycle
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(convex): send the juz', reminder, reassignment and dua messages`.

### Task 6: Inbound: join, buttons, typed replies, stop, relay

**Files:** Create `convex/rotaInbound.ts`. Modify `convex/whatsapp.ts` (`takeIncoming`, `handleIncoming`, `relayIncoming`), `convex/http.ts` (relay endpoint), `convex/dev.ts` (`simulateIncoming` accepts `payload` and `profileName`). Test: `convex/rotaInbound.test.ts`, `convex/whatsapp.test.ts`, `convex/http.*.test.ts`.

**Produces:**
- `rotaInbound.handle` (internalMutation `{ phone, text, payload?, profileName?, now }`) → `{ kind: "none" } | { kind: "reply"; text: string; buttons?: {id,title}[] }[]`, the replies to send in order. Every call first upserts `waContacts.lastInboundAt` for the phone, and sets `lastReplyAt = now`, `silentDays = 0`, `silencedAt = null` on every active participant row with this phone. Then:
  1. **Payload** (`decodePayload`): the participant must have this phone (**Review Focus 1**, else `helpText`). `done` marks that participant's unread reads of that day done (`doneByOrganizer: false`). If the day is closed → `closedText`; if already done → `alreadyText`; otherwise `thanksText(count)`. If that completed the day, the reply adds `duaText()` and `celebrateIfComplete(…, except: participant)` runs. `notYet` stamps `notYetAt` → `notYetText(reminder time if on and still ahead)`. `dua` → `duaText()`.
  2. **Join code** (`findJoinCode` → `khatmas.by_joinCode`, rota and not archived): an active participant with this phone → `joinedAt ??= now`, `stoppedAt = null`, and `personId` linked when a `people` row has the phone. The reply is the welcome with today's juz' and its buttons when an open day dated today has reads for them, else the next reading day and time. Not on the list → an open `rotaJoinRequests` row (one per phone and khatma), the organizer notified `rotaJoinRequest`, and reply `notOnListText`.
  3. **Typed word** (`classifyReply`) from a phone with active joined participants: `stop` sets `stoppedAt` on all of them, notifies each organizer `rotaStopped`, and replies `stopText`. `done`/`notYet` act like the payload when exactly one open day (dated today or still open) has unread reads for this phone, else reply `whichKhatmaText` with one button per khatma (payload for that day) (**Review Focus 2**). `dua` → `duaText()`.
  4. Anything else from such a phone → `helpText`. A phone with no rota participant → `{ kind: "none" }`.
- `takeIncoming` order: sign-in code match first (unchanged), then `rotaInbound.handle` (sign-in codes never reach it, and a join text never matches a sign-in code (**Review Focus 5**)). Replies go out with `sendWhatsAppText` / `sendWhatsAppButtons`. Outcome `"taken"` when it replied. `handleIncoming` sends `NO_MATCH_REPLY` only when neither handled it.
- Relay: production relays to staging when it didn't handle the message and any of these holds: the payload decodes with `staging: true`; `findJoinCode` finds a code production doesn't have; or `classifyReply` is non-null and production has no rota participant with the phone. `parseRelayed` and `/whatsapp/relay` carry `payload` and `profileName`, and staging runs the same `takeIncoming`.
- `dev:simulateIncoming` gains optional `payload` and `profileName`.

- [ ] **Step 1:** Failing tests, one per branch above, plus:
  - B's phone with A's payload changes nothing
  - a sign-in code text still signs in and never joins
  - a join text from a listed phone joins and replies with today's juz' buttons
  - an unlisted phone creates one request and notifies the organizer once
  - «إيقاف» stops every khatma for the phone
  - typed «تم» with two open khatmas replies with two buttons
  - `waContacts` updated
  - relay is chosen for a staging payload, and for an unknown join code
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(convex): join rota khatmas and answer their WhatsApp replies`.

### Task 7: Organizer web: join link, join status, requests, replies

**Files:** Modify `convex/khatmas.ts` (`view` adds `joinLink` for rota), `convex/rota.ts` (`people` rows and participants add `joined: boolean`, `stopped: boolean`, `silenced: boolean`, `phone: string`, organizer only; a `joinLink: string`; `requests: { id, name, phoneMasked, createdAt }[]`; `today` tiles add `answer: "notYet" | "none" | null`; new mutations `acceptJoinRequest({ inviteCode, requestId, juz })` → creates the participant on that juz' with `joinedAt = now`, `declineJoinRequest({ inviteCode, requestId })`), `apps/web/src/features/rota/RotaPeopleSetup.tsx`, `PeoplePanel.tsx`, `TodayPanel.tsx`, `apps/web/src/pages/RotaKhatmaPage.tsx`, `apps/web/src/i18n/ar.ts`. Test: the matching convex and web tests.

**Produces** (mockups `full-flow.html` sections B4, C, D3 and F1, under `.superpowers/brainstorm/*/content/`; the files may be gone, so follow spec 4 and 6.4):
- The join link is `joinLink(WHATSAPP_PUBLIC_NUMBER, khatmaTitle, joinCode)` (env `WHATSAPP_PUBLIC_NUMBER`, already used by sign-in). The group share message: «السلام عليكم، بدأنا ${title}، ختمة يومية بالتناوب. اضغطوا الرابط وأرسلوا الرسالة كما هي: ${joinLink}» via `https://wa.me/?text=…`.
- Setup step 2: the big green «أرسل رابط الانضمام إلى مجموعتكم» button opens that share, next to «تمّ».
- People rows show «انضمّ» (green), «لم ينضمّ · أعد الإرسال» (saffron; resend opens `https://wa.me/<their digits>?text=<share message>`), «أوقف الرسائل», «أوقفنا الرسائل» (silenced). Above the list: join requests, each with «أضفه واختر جزأه» (a juz' select of free ajza' → `acceptJoinRequest`) and «لا» (`declineJoinRequest`). The share button is at the bottom.
- The Today tile sheet shows «لم يردّ» or «ليس بعد» for the holder's answer.
- Visitor WhatsApp page: a big «انضمّ عبر واتساب» button to `joinLink`.

- [ ] **Step 1:** Failing tests:
  - convex: view's joinLink; people's joined flags and requests; accept creates a joined participant on the juz' and resolves the request; decline resolves it; today's answer
  - web: setup share href; row badges; resend href; accept sends `{ requestId, juz }`; the Today sheet answer line; the visitor join button href
- [ ] **Step 2:** Run them and see them fail. Implement. Run the full checks → pass.
- [ ] **Step 3:** Commit `feat(web): share the join link and show who joined and answered`.

### Task 8: Privacy page and end-to-end

**Files:** Modify `apps/web/public/privacy.html` (Arabic and English) and its test `apps/web/src/privacy.node.test.ts`, `convex/dev.ts` (`rotaPayload`, dev-only guard). Create `e2e/rota-whatsapp.spec.ts`. Modify `e2e/support.ts` if needed.

**Produces:**
- **Privacy (spec 8):** organizers enter participants' names and WhatsApp numbers. A participant gets messages only after sending the join message themselves: the daily juz', a reminder, reassignment notes and the completion message. «إيقاف» stops them. Meta receives the khatma title, juz' numbers and the participant's number for these messages. The PR says Ali approves the wording before merge.
- **e2e:**
  - The organizer creates a daily rota and adds participant B by phone.
  - `dev:simulateIncoming` sends B's join text (from the people page's join link text) from B's number.
  - The people row shows «انضمّ». After «تمّ», the day starts.
  - `dev:simulateIncoming` sends B's «أتممت» payload, built through a dev helper `dev:rotaPayload({ inviteCode, phone, action })` that returns the current day's payload.
  - Today shows B's juz' done and «٢ / ٣٠» (the organizer marks their own juz' done first).

- [ ] **Step 1:** Write the e2e test and update the privacy test's expected phrases.
- [ ] **Step 2:** Run `bun run e2e e2e/rota-whatsapp.spec.ts --project=desktop-chrome` → PASS, then the full checks.
- [ ] **Step 3:** Commit `test(e2e): join a rotating khatma and finish a juz' on WhatsApp` and `docs(web): describe rota WhatsApp messages on the privacy page`.
