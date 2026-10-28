# Wirdak plan 2 implementation plan: grace period, nudges, push, organizer controls, link previews

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a khatma moving without shaming anyone. Each juz' gets a grace period that pauses at night, with a private "almost up" note, one extension, and then quiet "open for help". Plan 2 also adds private pace nudges, web push, organizer controls, carrying the sign-in to the iPhone home-screen app, and WhatsApp link previews.

**Architecture:**
- **Business rules in Convex:** grace timing, notes, push delivery, pace, organizer powers, and hand-off tokens live in `convex/`, as in plan 1.
- **Pure time math:** waking-time arithmetic lives in pure, separately tested helpers (`convex/lib/wakingTime.ts`, `convex/lib/grace.ts`).
- **Exact timers:** time-based events use Convex scheduled functions at exact times. Every scheduled job re-checks state, so stale jobs do nothing.
- **Notes:** every message is a row in a `notes` table, shown in the app. A push is scheduled for it at the next waking moment.
- **Web app:** `apps/web` stays a thin client. It gains a service worker for push, the note cards, an organizer page, and a hand-off gate.
- **Link previews:** a Vercel function serves `/j/*` with Open Graph tags.

**Tech Stack:** as plan 1 (Convex, `convex-helpers`, Vitest, `convex-test`, Vite, React 19, React Router, Tailwind v4, Testing Library, Playwright), plus `web-push` (Convex Node action), and a Vercel Function (Web-standard `fetch` handler) in `apps/web/api/`.

**Spec:** `docs/superpowers/specs/2026-10-28-wirdak-plan2-design.md` (the "spec"; section numbers below refer to it). It builds on `docs/superpowers/specs/2026-10-27-silsila-v1-design.md`. Read both.

**Linear:** ARQ-245 (umbrella). Plan 2 gets its own issue under ARQ-245, created when the build starts. Branch names: `feat/arq-<plan-2 key>-<task-slug>`. Every PR is reviewed before merge.

**Out of scope:** the admin panel (plan 3), WhatsApp messages sent by the app, the English UI, and the plan 1 follow-ups the spec doesn't pull in (flaky `KhatmaPage.actions` test, self-hosted fonts, CSP, e2e in CI).

## Global Constraints

- **Plan 1's global constraints all still apply:**
  - Arabic only, RTL, every string in `apps/web/src/i18n/ar.ts`
  - logical CSS properties only
  - 18px base text, 56px buttons, a text label on every icon, WCAG AA
  - Eastern Arabic digits through `toArabicDigits()`
  - every secret generated in an action with `crypto.getRandomValues`, and only its SHA-256 hash stored
- **No time is shown to others.** Nothing in any view, tile, or note tells anyone other than the reader how long a juz' was held, that it was extended, or that it opened for help. An open-for-help juz' is `state: "open"` with `readerName: null` for everyone except its reader.
- **Grace defaults** (spec 3.1): daily 6 hours, every3days 1 day, weekly 2 days, biweekly 4 days, monthly 7 days, none 7 days. Limits: at least 30 minutes, at most 30 days, as written (for example 720 hours, or 43200 minutes).
- **Waking time** (spec 3.2): clocks run only from 07:00 to 22:00 in the reader's time zone. One grace day is 15 waking hours.
- **"Almost up" note:** fires when a quarter of the grace period, in waking time, is left.
- **Quiet hours:** 22:00 to 07:00. No push in that window. A push due then is sent at 07:00 if its note still applies. In-app notes appear at once.
- **Pace** (v1 spec 4.1): the median of the last 5 counted finishes across khatmas. Finishes under 20 minutes don't count. Default 3 days until 3 counted finishes. Kept between 1 and 7 days.
- **Gentle reminder:** at 1.5x pace.
- **Nudge cap:** one nudge (reminder or behind invite) per member per 24 hours.
- **Organizer alert** (spec 3.3, 3.4, 5.3): the same wording whenever a juz' goes back to the pool by timeout or "I can't finish it". It never goes to the organizer when they're the one releasing or the one whose juz' it is, and never for a removal.
- **Automatic handover:** organizer away 30 days. The successor is the earliest-joined active member seen in the last 7 days.
- **Hand-off token:** `randomToken(32)`, single use, expires after 30 minutes, dead once its session is gone. It travels only in the swapped-in manifest's `start_url`, never in the page's address bar or history. Redeeming it creates a session with the device label `iPhone · الشاشة الرئيسية` and sends no WhatsApp alert.
- **Time-zone fallback:** a stored time zone that `Intl` rejects is treated as `Asia/Dubai`.
- **No data migration.** Production has no data (ARQ-254). Schema fields may be required. Reset the local dev backend if old rows fail validation.

## Review Focus

1. **Stale timers.** A grace-end job scheduled before an extension, undo, finish, release, or takeover must change nothing. Test in Task 4.
2. **Bad time zones and daylight saving.** `"Not/AZone"`, London across the March change, and Kolkata (+05:30) must give correct waking times and never throw. Test in Task 1.
3. **Hostile names in link previews.** A khatma or display name containing `"`, `<`, `>` or `&` must be escaped in the injected tags, never break the HTML. Test in Task 8.
4. **Shared browsers.** If the same push endpoint subscribes under a second person on the same browser, it moves to that person, and the first person stops getting pushes there. A 404 or 410 from the push service deletes the subscription. Test in Task 3.
5. **Hand-off token in Safari.** A token in a Safari tab, not the home-screen app, must not be redeemed. Replaying a used token creates nothing. Test in Tasks 7 and 9.

---

## File structure

```
convex/
  lib/wakingTime.ts        waking-time math (Task 1)
  lib/grace.ts             Grace type, defaults, validation, grace times (Task 1)
  lib/pace.ts              pace from finish durations (Task 5)
  lib/noteText.ts          Arabic text of every note, shared by push and web (Task 3)
  schema.ts, lib/settings.ts   new tables, fields, settings (Task 2)
  notes.ts                 notify, clearNotes, forKhatma, dismiss (Task 3)
  push.ts                  subscribe, unsubscribe, publicKey, deliveryPlan, removeGone (Task 3)
  pushNode.ts              "use node": deliver (web-push) (Task 3)
  grace.ts                 noticeDue, endDue, alertOrganizer (Task 4)
  pool.ts                  take/finish/undo/release changes, stillReading (Task 4)
  nudges.ts                reminderDue, behindSweep (Task 5)
  hooks.ts                 onRoundCompleted sends completion notes (Task 5)
  organizer.ts             settings, update, resetInvite, removeMember, unblock, handOver, autoHandoverSweep (Task 6)
  people.ts                touch, myStats (Tasks 5, 6)
  handoff.ts               create, redeem (Task 7)
  preview.ts, http.ts      GET /api/preview (Task 8)
  crons.ts, maintenance.ts behind sweep, handover sweep, purge notes and hand-off tokens
  dev.ts                   forceGraceEnd (Task 13)
apps/web/
  api/invite.ts            Vercel Function for /j/* with OG tags (Task 8)
  src/lib/og.ts            previewTags, injectOg (pure, Task 8)
  public/sw.js             push + notificationclick (Task 9)
  public/og.png, public/icons/*   rendered by scripts/render-images.ts (Tasks 8, 9)
  src/lib/push.ts, src/lib/handoff.ts, src/lib/useTouch.ts (Task 9)
  src/components/NoteCard.tsx, GraceField.tsx, PushPromptSheet.tsx, InstallStepsSheet.tsx (Tasks 9, 10)
  src/pages/OrganizerPage.tsx (Task 11)
scripts/render-images.ts, scripts/images/{og,icon}.html (Tasks 8, 9)
```

---

### Task 1: Waking-time and grace helpers

**Files:**
- Create: `convex/lib/wakingTime.ts`, `convex/lib/grace.ts`
- Test: `convex/lib/wakingTime.test.ts`, `convex/lib/grace.test.ts`

**Interfaces:**
- Produces:
  - `type QuietHours = { startHour: number; endHour: number }` (defaults come from settings: 22 and 7).
  - `safeTimeZone(tz: string): string`: `tz` if `Intl.DateTimeFormat` accepts it, else `"Asia/Dubai"`.
  - `isQuiet(at: number, tz: string, q: QuietHours): boolean`.
  - `nextAwake(at: number, tz: string, q: QuietHours): number`: `at` when awake, else the next local `endHour:00`.
  - `addWakingMs(start: number, wakingMs: number, tz: string, q: QuietHours): number`.
  - `wakingDayMs(q: QuietHours): number` (15 hours for 22/7).
  - `type GraceUnit = "minutes" | "hours" | "days"`; `type Grace = { value: number; unit: GraceUnit }`; `graceValidator` (Convex `v.object`).
  - `DEFAULT_GRACE: Record<Schedule, Grace>` with the spec's six values.
  - `isValidGrace(g: Grace): boolean`: integer `value` at least 1, at least 30 minutes, and at most 30 days as written.
  - `graceWakingMs(g: Grace, q: QuietHours): number`: minutes and hours convert directly; days multiply by `wakingDayMs(q)`.
  - `graceTimes(takenAt: number, wakingMs: number, tz: string, q: QuietHours, noticeFraction: number): { noticeAt: number; endsAt: number }`: `noticeAt = addWakingMs(takenAt, wakingMs * (1 - noticeFraction))`, `endsAt = addWakingMs(takenAt, wakingMs)`.

- [ ] **Step 1: Write the failing tests**

```ts
const Q = { startHour: 22, endHour: 7 };
const dubai = (iso: string) => Date.parse(`${iso}+04:00`);
const H = 3_600_000;
test("6 hours from 21:30 Dubai ends 12:30 next day; notice at 11:00", () => {
  const t = graceTimes(dubai("2026-11-02T21:30:00"), 6 * H, "Asia/Dubai", Q, 0.25);
  expect(t.endsAt).toBe(dubai("2026-11-03T12:30:00"));
  expect(t.noticeAt).toBe(dubai("2026-11-03T11:00:00"));
});
test("2 days from Monday 10:00 ends Wednesday 10:00", () => {
  const ms = graceWakingMs({ value: 2, unit: "days" }, Q);
  expect(addWakingMs(dubai("2026-11-02T10:00:00"), ms, "Asia/Dubai", Q)).toBe(dubai("2026-11-04T10:00:00"));
});
test("a start inside quiet hours begins at 07:00", () => {
  expect(addWakingMs(dubai("2026-11-02T23:00:00"), H, "Asia/Dubai", Q)).toBe(dubai("2026-11-03T08:00:00"));
});
test("London across the March DST change", () => {
  // Sat 28 Mar 2026 21:00 GMT + 2 waking hours → Sun 29 Mar 08:00 BST (07:00 UTC)
  expect(addWakingMs(Date.parse("2026-03-28T21:00:00Z"), 2 * H, "Europe/London", Q)).toBe(Date.parse("2026-03-29T07:00:00Z"));
});
test("Kolkata half-hour offset", () => {
  expect(nextAwake(Date.parse("2026-11-02T17:00:00Z") /* 22:30 IST */, "Asia/Kolkata", Q)).toBe(Date.parse("2026-11-03T01:30:00Z") /* 07:00 IST */);
});
test("unknown time zone falls back to Asia/Dubai and never throws", () => {
  expect(safeTimeZone("Not/AZone")).toBe("Asia/Dubai");
  expect(() => addWakingMs(0, H, "Not/AZone", Q)).not.toThrow();
});
test("grace validation and defaults", () => {
  expect(DEFAULT_GRACE.daily).toEqual({ value: 6, unit: "hours" });
  expect(DEFAULT_GRACE.none).toEqual({ value: 7, unit: "days" });
  expect(isValidGrace({ value: 29, unit: "minutes" })).toBe(false);
  expect(isValidGrace({ value: 30, unit: "minutes" })).toBe(true);
  expect(isValidGrace({ value: 31, unit: "days" })).toBe(false);
  expect(isValidGrace({ value: 1.5, unit: "hours" })).toBe(false);
});
```

- [ ] **Step 2:** Run `pnpm test convex/lib/wakingTime convex/lib/grace`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** For the local wall-clock time of an instant, use `Intl.DateTimeFormat(…, { timeZone, hourCycle: "h23", year, month, day, hour, minute })` and `formatToParts`. To turn a local time into an instant, guess it as UTC, subtract the zone offset at that guess, then correct once more with the offset at the result (this handles DST). `addWakingMs` walks one awake window at a time: from `nextAwake(cursor)` to that local day's `startHour:00`.
- [ ] **Step 4:** Run the tests. Expected: PASS. Also run `pnpm exec convex dev --once` and `pnpm exec convex run` on a throwaway internal query that calls `addWakingMs` with `Europe/London`, to confirm Convex's runtime has full time-zone data. Delete the throwaway afterwards.
- [ ] **Step 5: Commit** `feat: add waking-time and grace helpers`.

---

### Task 2: Schema, settings, and a grace period on khatmas

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/settings.ts`, `convex/khatmas.ts`, `convex/pool.ts` (rename `nudgesOn`), every test that inserts `members`, `people`, `assignments`, or `khatmas` rows
- Test: `convex/khatmas.test.ts`, `convex/schema.test.ts`

**Interfaces:**
- Consumes: `graceValidator`, `DEFAULT_GRACE`, `isValidGrace` (Task 1).
- Produces schema changes:
  - `khatmas.grace: Grace`.
  - `members`:
    - `notificationsOn: boolean` replaces `nudgesOn`
    - `lastNudgeAt: number | null`
    - `status` adds `"former"`. An unblocked person who isn't a member; `take` treats it like no membership and reactivates the row.
  - `people.lastSeenAt: number`.
  - `assignments` adds:
    - `graceWakingMs: number`
    - `noticeAt: number`
    - `graceEndsAt: number`
    - `extended: boolean`
    - `noticeSentAt: number | null`
    - `openedForHelpAt: number | null`
    - `remindedAt: number | null`
    - new index `by_person_finishedAt` (`personId`, `finishedAt`)
  - `rounds.behindInvitedAt: number | null`.
  - New table `notes`:
    - fields:
      - `personId`, `khatmaId`
      - `kind: "almostUp" | "openForHelp" | "thanks" | "reminder" | "behind" | "completed" | "nowOrganizer" | "organizerMoved"`
      - `juz: number[]`, `count: number | null`, `until: number | null`
      - `assignmentId: Id<"assignments"> | null`, `roundNumber: number | null`
      - `createdAt`, `pushedAt: number | null`, `clearedAt: number | null`
    - indexes: `by_person_khatma` (`personId`, `khatmaId`, `clearedAt`), `by_khatma_kind` (`khatmaId`, `kind`, `clearedAt`), `by_assignment` (`assignmentId`), `by_createdAt`
  - New table `pushSubscriptions`: `personId`, `sessionId`, `endpoint`, `p256dh`, `auth`, `createdAt`. Indexes `by_person`, `by_session`, `by_endpoint`.
  - New table `handoffTokens`: `tokenHash`, `personId`, `sessionId`, `createdAt`, `expiresAt`, `usedAt: number | null`. Indexes `by_tokenHash`, `by_createdAt`.
- Produces `SETTING_DEFAULTS` additions:
  - **Grace:**
    - `graceDefaults: DEFAULT_GRACE`
    - `graceNoticeFraction: 0.25`
    - `quietStartHour: 22`, `quietEndHour: 7`
  - **Pace:**
    - `defaultPaceMs: 3 * DAY`
    - `paceMinMs: DAY`, `paceMaxMs: 7 * DAY`
    - `paceMinCountedMs: 20 * MINUTE`
    - `paceSampleSize: 5`, `paceMinFinishes: 3`
  - **Nudges and alerts:**
    - `reminderPaceMultiple: 1.5`
    - `nudgeCooldownMs: DAY`
    - `openForHelpBatchMs: HOUR`
  - **Organizer:**
    - `organizerInactiveMs: 30 * DAY`
    - `successorActiveMs: 7 * DAY`
  - **Retention:**
    - `notesRetentionMs: 30 * DAY`
    - `handoffTtlMs: 30 * MINUTE`
  - **Rate limits:**
    - `previewPerIpPerMinute: 30`
    - `handoffRedeemGlobalPerMinute: 60`
  - Plus helper `quietHours(ctx): Promise<QuietHours>`.
- Produces `api.khatmas.create` args gain `grace: v.optional(graceValidator)`. Missing means `graceDefaults[schedule]`. Invalid throws `ConvexError({ code: "invalid_grace" })`.
- Produces `KhatmaView` changes:
  - top level: `grace: Grace`, `isOrganizer: boolean`
  - `me.notificationsOn: boolean | null` (null for non-members)
  - `me.hold: { openForHelp: boolean; canExtend: boolean; paceDays: number | null } | null`. Filled by Tasks 4 and 5; until then `{ openForHelp: false, canExtend: false, paceDays: null }` whenever `holding` isn't null.
- Produces `api.khatmas.setNotifications` (sessionMutation, `{ inviteCode: string; on: boolean }`) → `{ ok: boolean }`.

- [ ] **Step 1: Write the failing tests** in `khatmas.test.ts`:

```ts
test("create stores the schedule's default grace", async () => { /* daily → view.grace = { value: 6, unit: "hours" }; none → { value: 7, unit: "days" } */ });
test("create accepts a custom grace and rejects an invalid one", async () => { /* { value: 45, unit: "minutes" } ok; { value: 10, unit: "minutes" } rejects invalid_grace */ });
test("isOrganizer is true only for the creator", async () => {});
test("setNotifications flips notificationsOn for a member only", async () => { /* viewer → { ok: false } */ });
```

- [ ] **Step 2:** Run `pnpm test convex`. Expected: FAIL (and type errors where tests insert old shapes).
- [ ] **Step 3: Implement.**
  - Update the schema and every fixture insert. People rows get `lastSeenAt` at creation in `verification.ts` too.
  - `take` writes the new assignment fields with placeholders until Task 4: `graceWakingMs: 0`, `noticeAt: takenAt`, `graceEndsAt: takenAt`, `extended: false`, nulls for the rest.
  - Rename `nudgesOn` everywhere.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add plan 2 schema, settings, and khatma grace`.

---

### Task 3: Notes, push subscriptions, and delivery

**Files:**
- Create: `convex/lib/noteText.ts`, `convex/notes.ts`, `convex/push.ts`, `convex/pushNode.ts`
- Modify: `convex/sessions.ts` (sign-out paths), `convex/maintenance.ts`, `convex/khatmas.ts` (`mine.hasNote`), `package.json` (add `web-push`, `@types/web-push`)
- Test: `convex/notes.test.ts`, `convex/push.test.ts`, `convex/lib/noteText.test.ts`

**Interfaces:**
- Consumes: Task 1 (`nextAwake`, `safeTimeZone`), Task 2 tables, `quietHours`.
- Produces:
  - `type NoteKind` (the 8 kinds above).
  - `type NoteView = { noteId: Id<"notes">; kind: NoteKind; juz: number[]; count: number | null; until: number | null; createdAt: number }`.
  - `noteText(n: { kind: NoteKind; juz: number[]; count: number | null; until: number | null }): string` returns the exact Arabic text, with Eastern digits and the weekday from `Intl.DateTimeFormat("ar", { weekday: "long" })`. These are the only copies; the web app imports this file through `t.notes.text`:
    - `almostUp`: `مهلة الجزء ${n} أوشكت على الانتهاء. هل تحتاج وقتاً أطول؟`
    - `openForHelp` (one juz'): `الجزء ${n} متاح لمن يساعد. هل تأخذه أو ترسل الدعوة؟`
    - `openForHelp` (several): `الأجزاء ${list} متاحة لمن يساعد. هل تأخذ أحدها أو ترسل الدعوة؟`, where `list` is joined with `، ` and ` و` before the last
    - `thanks`: `أحدهم يُكمل الجزء ${n} الآن. جزاكما الله خيراً.`
    - `reminder`: `الجزء ${n} في انتظارك، يسّر الله لك.`
    - `behind`: `الختمة تحتاج ${ajzaa(count)} قبل ${when(until)}. هل تأخذ جزءاً؟`, or without `قبل …` once `until` has passed. `when` is the weekday (`الجمعة`) when `until` is within 6 days, else `formatDate`-style day and month (`١٢ نوفمبر`). `ajzaa(n)` agrees with the number: 1 `جزءاً واحداً`, 2 `جزأين`, 3 to 10 `${n} أجزاء`, 11 and up `${n} جزءاً`
    - `completed`: `ختمنا القرآن معاً، الحمد لله`
    - `nowOrganizer`: `أصبحتَ منظّم هذه الختمة. جزاك الله خيراً.`
    - `organizerMoved`: `مرّ وقت منذ زيارتك، فنقلنا تنظيم الختمة إلى أحد أعضائها ليستمر الخير. ما زلت عضواً فيها.`
  - `notify(ctx: MutationCtx, n: { personId; khatmaId; kind; juz?: number[]; count?: number | null; until?: number | null; assignmentId?: Id<"assignments"> | null; roundNumber?: number | null }): Promise<Id<"notes">>`: inserts the note. If the person's membership has `notificationsOn` and the person has at least one push subscription, it schedules `internal.pushNode.deliver({ noteId })` at `nextAwake(now, person.timeZone, quietHours)`.
  - `clearNotes(ctx: MutationCtx, where: { assignmentId: Id<"assignments">; kinds?: NoteKind[] } | { khatmaId: Id<"khatmas">; kind: "openForHelp"; juz: number }): Promise<void>`:
    - The first form clears matching notes.
    - The second form removes `juz` from uncleared organizer alerts, and clears an alert left with no juz'.
  - `api.notes.forKhatma` (sessionQuery, `{ inviteCode }`) → `NoteView[]`: the caller's uncleared notes in that khatma, newest first; `[]` for signed-out callers.
  - `api.notes.dismiss` (sessionMutation, `{ noteId }`) → `{ ok: boolean }`: only for the caller's own note.
  - `api.khatmas.mine` rows gain `hasNote: boolean`.
  - `api.push.publicKey` (query) → `string | null`, from env `VAPID_PUBLIC_KEY`.
  - `api.push.subscribe` (sessionMutation, `{ endpoint, p256dh, auth }`) → `{ ok: boolean }`. It upserts by `endpoint` and moves the row to the caller's person and session if it belonged to someone else. At most 10 per person; the oldest is dropped.
  - `api.push.unsubscribe` (sessionMutation, `{ endpoint }`).
  - `api.push.mine` (sessionQuery) → `{ thisDevice: boolean }` given `{ endpoint?: string }`.
  - `internal.push.deliveryPlan` (internal query, `{ noteId }`) → `{ subscriptions: { endpoint; p256dh; auth }[]; payload: { title: "وِردك"; body: string; url: string } } | null`. It returns null when the note is cleared, the membership is gone or notifications are off, or there are no subscriptions. `url` is `/j/${inviteCode}`.
  - `internal.push.removeGone` (internal mutation, `{ endpoints: string[] }`).
  - `internal.push.markPushed` (internal mutation, `{ noteId }`): sets `notes.pushedAt`.
  - `internal.pushNode.deliver` (internal action, `"use node"`, `{ noteId }`): runs `deliveryPlan`, calls `markPushed`, and sends with `web-push`, using `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and a TTL of 12 hours. Endpoints answering 404 or 410 go to `removeGone`. With VAPID unset in dev it logs `push skipped (no VAPID)` and returns.
  - `deleteSession(ctx: MutationCtx, sessionId: Id<"sessions">): Promise<void>` in `sessions.ts`: deletes the session plus its push subscriptions and hand-off tokens. Every sign-out path uses it.
  - `maintenance.purge` also deletes notes older than `notesRetentionMs` and hand-off tokens older than 1 day.

- [ ] **Step 1: Write the failing tests:**

```ts
test("noteText covers every kind in Eastern digits", () => {
  expect(noteText({ kind: "almostUp", juz: [12], count: null, until: null })).toBe("مهلة الجزء ١٢ أوشكت على الانتهاء. هل تحتاج وقتاً أطول؟");
  expect(noteText({ kind: "openForHelp", juz: [12, 15], count: null, until: null })).toContain("١٢ و١٥");
  expect(noteText({ kind: "behind", juz: [], count: 1, until: null })).toBe("الختمة تحتاج جزءاً واحداً. هل تأخذ جزءاً؟");
  expect(noteText({ kind: "behind", juz: [], count: 2, until: null })).toContain("جزأين");
  expect(noteText({ kind: "behind", juz: [], count: 12, until: null })).toContain("١٢ جزءاً");
});
test("notify inserts a note and schedules push at the next waking moment", async () => { /* person in Asia/Dubai with a subscription, now = 23:00 local → scheduled deliver at 07:00 local */ });
test("notify schedules no push when notifications are off or there is no subscription", async () => {});
test("deliveryPlan is null once the note is cleared", async () => {});
test("forKhatma returns only the caller's uncleared notes; dismiss only works on own notes", async () => {});
test("subscribing an endpoint already owned by another person moves it", async () => { /* A subscribes E; B subscribes E → deliveryPlan for A's note has no subscriptions */ });
test("removeGone deletes subscriptions", async () => {});
test("signing out deletes that session's subscriptions", async () => {});
test("clearNotes removes one juz from a batched organizer alert", async () => { /* alert [12,15]; clear 12 → [15]; clear 15 → cleared */ });
test("mine shows hasNote", async () => {});
test("purge deletes notes older than 30 days", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/notes convex/push convex/lib/noteText`. Expected: FAIL.
- [ ] **Step 3: Implement.** Tests never execute `pushNode.deliver`, because `web-push` doesn't load in the `edge-runtime` test environment. Assert on the `_scheduled_functions` system table instead, and keep suites that run all scheduled functions free of push subscriptions. Keep `pushNode.ts` free of logic: it calls `deliveryPlan`, sends, and reports gone endpoints. Add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` to `docs/deploy.md`, with how to generate them (`npx web-push generate-vapid-keys`) and how to rotate them: rotating invalidates every subscription, and browsers re-subscribe on the next visit (Task 9).
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Then in dev, set VAPID keys with `pnpm exec convex env set`, subscribe from Chrome (after Task 9, or with a hand-made subscription), and confirm a push arrives. Note the result in the PR.
- [ ] **Step 5: Commit** `feat: add notes, push subscriptions, and push delivery`.

---

### Task 4: Grace lifecycle

**Files:**
- Create: `convex/grace.ts`
- Modify: `convex/pool.ts`, `convex/rounds.ts` (`juzStates`), `convex/khatmas.ts` (`buildTiles`, `view.me.hold`)
- Test: `convex/grace.test.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces:
  - **Take** (`api.pool.take`):
    - computes `graceWakingMs = graceWakingMs(khatma.grace, quiet)` and `{ noticeAt, endsAt } = graceTimes(now, …, safeTimeZone(person.timeZone), quiet, graceNoticeFraction)`
    - stores them, and schedules `internal.grace.noticeDue({ assignmentId })` at `noticeAt` and `internal.grace.endDue({ assignmentId, endsAt })` at `endsAt`
    - taking an open-for-help juz' ends the old row: `releasedAt = now`, `releasedBySystem = true`. It then sends `notify(oldReader, "thanks", [juz])`, clears the old row's notes, and calls `clearNotes({ khatmaId, kind: "openForHelp", juz })`
  - **Tile state:**
    - `juzStates` treats a row with `openedForHelpAt !== null` (not finished, not released) as not taken. `heldAssignment` still returns it for its reader.
    - `isTaken` follows the same rule.
    - `buildTiles` shows such a row as `state: "reading"`, `isMine: true` to its reader only, and as `state: "open"`, `readerName: null` to everyone else.
  - `internal.grace.noticeDue({ assignmentId })`: if the row is held, not extended, not opened, and `noticeSentAt === null`, it sets `noticeSentAt` and sends `notify(reader, "almostUp", [juz], assignmentId)`.
  - `internal.grace.endDue({ assignmentId, endsAt })`: does nothing unless the row is held (not finished, not released), not opened, and `graceEndsAt === endsAt`. Only when all three hold does it set `openedForHelpAt = now`, clears the row's `almostUp` and `reminder` notes, and calls `alertOrganizer`.
  - `alertOrganizer(ctx: MutationCtx, khatma: Doc<"khatmas">, juz: number, actorPersonId: Id<"people">): Promise<void>`:
    - Skips when `khatma.creatorPersonId === actorPersonId`.
    - Otherwise it appends `juz` to the organizer's uncleared `openForHelp` note in this khatma created within `openForHelpBatchMs`, or calls `notify` for a new one.
    - If the note's push hasn't gone out yet, that pending push reads the current list when it's delivered. If it has (`pushedAt !== null`), it schedules another `deliver` for the note at the next waking moment, so every juz' reaches the organizer by push too.
  - `api.pool.stillReading` (sessionMutation, `{ inviteCode }`) → `{ ok: true } | { ok: false; reason: "not_holding" | "already_extended" | "opened" | "blocked" | "rate_limited" | "maintenance" }`:
    - sets `extended = true` and `graceEndsAt = addWakingMs(graceEndsAt, graceWakingMs, tz, quiet)`
    - schedules `endDue` with the new end
    - clears the `almostUp` note
  - **Finish** (`api.pool.finish`):
    - works on an open-for-help hold, and clears that row's notes and the organizer alert for the juz'
    - `FinishResult` failure reasons gain `"taken_over"`, returned when the caller holds nothing and their latest row in the round has `releasedBySystem && openedForHelpAt !== null`
  - **Release** (`api.pool.release`): also calls `alertOrganizer(ctx, khatma, juz, person._id)` and clears the row's notes.
  - **Undo** (`api.pool.undoFinish`): restores the row as it was. Then, for a row that isn't opened:
    - if `noticeSentAt === null`, it isn't extended, and `noticeAt <= now`, it schedules `noticeDue` right away (the original job ran while the row was finished and did nothing)
    - if `graceEndsAt <= now`, it schedules `endDue` right away

    If the row was opened, undo re-adds the organizer alert.
  - `view.me.hold`:
    - `openForHelp: openedForHelpAt !== null`
    - `canExtend: noticeSentAt !== null && !extended && openedForHelpAt === null`

- [ ] **Step 1: Write the failing tests** (fake timers; `t.finishAllScheduledFunctions(vi.runAllTimers)` or `vi.advanceTimersByTime` with `t.finishInProgressScheduledFunctions`):

```ts
test("almost-up note fires at a quarter left, and no push falls in quiet hours", async () => { /* daily khatma, reader in Asia/Dubai takes at 21:30 → note createdAt 11:00 next day */ });
test("stillReading extends once; second tap returns already_extended", async () => {});
test("after the extension runs out the juz opens with no second almost-up note", async () => {});
test("opened juz looks open to members, viewers, and the organizer; reader still sees it as theirs", async () => { /* tile state "open", readerName null for B, viewer, organizer; reader: state "reading", isMine true; view JSON for B has no field naming the reader */ });
test("organizer alert on timeout and on release are identical", async () => { /* compare note kind and noteText for a timed-out juz and a released juz */ });
test("no organizer alert when the organizer is the reader or the releaser", async () => {});
test("two ajza opening within an hour make one alert listing both", async () => {});
test("a juz added after the batched alert was pushed schedules another push", async () => {});
test("undo after noticeAt passed while finished sends the almost-up note", async () => {});
test("reader finishes after open: counts done and completion still works", async () => {});
test("someone else takes it: old row released by system, one thanks note, reader's pace unchanged", async () => {});
test("reader finishing after takeover gets taken_over", async () => {});
test("stale endDue after extension, finish, release, takeover, or undo changes nothing", async () => { /* run the old job manually with the old endsAt → row unchanged */ });
test("undo of an opened juz returns it to opened, not to a fresh grace", async () => {});
test("undo past the grace end opens it at once", async () => {});
test("grace change after take does not move a running hold", async () => { /* patch khatma.grace shorter; endsAt unchanged */ });
test("notifications off: no push scheduled, note still exists, juz still opens", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/grace`. Expected: FAIL.
- [ ] **Step 3: Implement.** Re-run plan 1's suites too. `isTaken`, `juzStates`, and `buildTiles` change behaviour, and plan 1's race and completion tests must stay green.
- [ ] **Step 4:** Run `pnpm test convex`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: grace period, extension, and open for help`.

---

### Task 5: Pace, reminders, the behind invite, personal numbers, and the completion note

**Files:**
- Create: `convex/lib/pace.ts`, `convex/nudges.ts`
- Modify: `convex/pool.ts` (schedule the reminder in `take`), `convex/hooks.ts`, `convex/crons.ts`, `convex/people.ts`, `convex/khatmas.ts` (`me.hold.paceDays`)
- Test: `convex/lib/pace.test.ts`, `convex/nudges.test.ts`, `convex/people.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces:
  - `paceFrom(durationsNewestFirst: number[], s: { defaultPaceMs; paceMinMs; paceMaxMs; paceMinCountedMs; paceSampleSize; paceMinFinishes }): { paceMs: number; known: boolean }`: drops durations under `paceMinCountedMs`, takes the first `paceSampleSize`, uses the median (the mean of the middle two for an even count), clamps to the bounds, and sets `known` when the count is at least `paceMinFinishes`.
  - `personPace(ctx: QueryCtx, personId): Promise<{ paceMs: number; known: boolean }>` reads `by_person_finishedAt` newest first, stopping after 50 rows.
  - `paceDays(paceMs: number): number`: `Math.round(paceMs / DAY)`, at least 1.
  - **Reminder:** `take` schedules `internal.nudges.reminderDue({ assignmentId })` at `nextAwake(takenAt + reminderPaceMultiple * paceMs)`. `reminderDue` sends `notify(reader, "reminder", [juz])` and sets `remindedAt` and `member.lastNudgeAt`, but only if:
    - the row is held and not opened
    - `noticeSentAt === null`
    - `noticeAt` is not on the same local calendar day as now, or earlier
    - `member.lastNudgeAt` is null or older than `nudgeCooldownMs`
  - **Behind invite:** `internal.nudges.behindSweep` runs hourly from `crons.ts` and pages through khatmas with a current round that has `targetEndAt !== null`. For each round:
    - **Inputs:**
      - `open` = 30 minus done minus reading
      - `free` = active members holding nothing
      - `remainingMs = max(0, targetEndAt - now)`
      - `capacity` = Σ over all active members of `floor(remainingMs / paceMs)`, minus 1 for each member holding a juz'
    - **Behind** means `open > 0` and either `open > capacity` or `remainingMs === 0`.
    - **Skip the round** if it isn't behind, or if `round.behindInvitedAt` is within `nudgeCooldownMs`.
    - **Shortfall:** `open` when `remainingMs === 0`, else `open - max(0, capacity)`.
    - **Invite:** sort `free` by `paceMs` ascending, drop members already invited this round (a `behind` note with this `roundNumber`) and members inside the nudge cooldown, then take the first `shortfall`. Send each `notify(m, "behind", count = open, until = targetEndAt, roundNumber)`, and set their `lastNudgeAt` and `round.behindInvitedAt`.
  - **Completion note:** `onRoundCompleted` sends `notify(member, "completed", roundNumber)` to every active member, and clears that round's `behind` notes.
  - `api.people.myStats` (sessionQuery) → `{ paceDays: number | null; juzRead: number; weekStreak: number | null } | null`:
    - `paceDays` only when pace is known.
    - `weekStreak` counts consecutive Saturday-to-Friday weeks in the person's time zone with at least one finish, ending this week or last week. It's null when under 2.
  - `view.me.hold.paceDays` is the reader's `paceDays` when known.

- [ ] **Step 1: Write the failing tests:**

```ts
test("paceFrom", () => {
  const s = { defaultPaceMs: 3 * DAY, paceMinMs: DAY, paceMaxMs: 7 * DAY, paceMinCountedMs: 20 * MIN, paceSampleSize: 5, paceMinFinishes: 3 };
  expect(paceFrom([], s)).toEqual({ paceMs: 3 * DAY, known: false });
  expect(paceFrom([2 * DAY, 10 * MIN, 2 * DAY, 4 * DAY], s)).toEqual({ paceMs: 2 * DAY, known: true });
  expect(paceFrom([HOUR, HOUR, HOUR], s).paceMs).toBe(DAY);
  expect(paceFrom([9 * DAY, 9 * DAY, 9 * DAY], s).paceMs).toBe(7 * DAY);
});
test("reminder at 1.5x pace, once, never after almost-up, never inside the cooldown", async () => {});
test("daily khatma: almost-up comes first and the reminder is skipped", async () => {});
test("behind invite goes to the fastest free members first and never to holders", async () => {});
test("behind invite reaches only as many members as the shortfall", async () => { /* open 20, capacity 18 → 2 notes */ });
test("behind invite widens at most once a day and is off for no-deadline khatmas", async () => {});
test("completion sends one completed note per active member", async () => {});
test("myStats: pace hidden under 3 finishes; streak null under 2 weeks; juzRead counts finishes", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/lib/pace convex/nudges convex/people`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test convex`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: private pace, gentle reminders, behind invite, and completion note`.

---

### Task 6: Organizer controls, touch, and automatic handover

**Files:**
- Create: `convex/organizer.ts`
- Modify: `convex/people.ts` (`touch`), `convex/pool.ts` (`take` reactivates `"former"`), `convex/crons.ts`
- Test: `convex/organizer.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4; `cleanTimeZone` (`verification.ts`), `cleanKhatmaName`, `randomToken`.
- Produces:
  - `requireOrganizer(ctx, inviteCode): Promise<{ person; khatma }>`: throws `ConvexError({ code: "forbidden" })` unless the caller is the khatma's `creatorPersonId` and an active member.
  - `api.organizer.settings` (sessionQuery, `{ inviteCode }`) → `{ name: string | null; schedule: Schedule; grace: Grace; suggestedGrace: Grace; members: { memberId: Id<"members">; displayName: string; isOrganizer: boolean }[]; blocked: { memberId: Id<"members">; displayName: string }[] } | { forbidden: true }`. Members are sorted by `joinedAt`. Rows carry no phone numbers and no reading data.
  - `api.organizer.update` (sessionMutation, `{ inviteCode; name?: string | null; schedule?: Schedule; grace?: Grace }`) → `{ ok: true } | { ok: false; reason: "invalid_grace" }`. It throws `forbidden`. A schedule change affects only the next round (`insertRound` reads it).
  - `api.organizer.resetInvite` (action, `{ sessionToken; inviteCode }`) → `{ inviteCode: string }`. It generates `randomToken(9)` and one `randomToken(8)` per active member. `internal.organizer.applyInviteReset` assigns them, clears share tokens of non-active rows, and returns null on a code collision; the action then retries.
  - `api.organizer.removeMember` (sessionMutation, `{ inviteCode; memberId }`) → `{ ok: true } | { ok: false; reason: "self" | "not_member" }`. It sets the status to `"blocked"`, unsets `shareToken`, and ends their hold with `releasedBySystem: true` and no alert. It clears that person's notes in this khatma and any organizer alert for that juz'.
  - `api.organizer.unblock` (sessionMutation, `{ inviteCode; memberId }`): sets `"blocked"` to `"former"`.
  - `api.organizer.handOver` (sessionMutation, `{ inviteCode; memberId }`) → `{ ok: true } | { ok: false; reason: "not_member" | "self" }`. It sets `creatorPersonId` and sends `notify(newOrganizer, "nowOrganizer")`.
  - `internal.organizer.autoHandoverSweep`: runs daily. For a khatma whose organizer has `lastSeenAt < now - organizerInactiveMs`, it picks the earliest-joined active member with `lastSeenAt >= now - successorActiveMs`, other than the organizer. It hands over, notifying `nowOrganizer` to the new organizer and `organizerMoved` to the old one. With no candidate it does nothing.
  - `api.people.touch` (sessionMutation, `{ timeZone: string }`) → `{ ok: boolean }`. It sets `person.lastSeenAt` when it's older than an hour, and `person.timeZone = cleanTimeZone(timeZone)` when different. `sessionMutation` already refreshes `lastUsedAt`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("only the organizer can read settings or act", async () => { /* member → { forbidden: true }; mutations throw forbidden; a removed former organizer is refused */ });
test("settings lists names only, by join date", async () => { /* expect no key matching /phone|pace|finished|taken/ in JSON */ });
test("update: rename, schedule from next round, grace validation", async () => {});
test("resetInvite: old code notFound, old share tokens give no inviterName, new code works", async () => {});
test("removeMember frees their juz without an organizer alert and blocks rejoining", async () => { /* take → blocked; unblock → take ok and membership active again */ });
test("organizer cannot remove themselves", async () => {});
test("handOver moves the role and notifies the new organizer", async () => {});
test("autoHandover after 30 days picks the earliest active joiner; no candidate → no change", async () => {});
test("touch updates lastSeenAt and timeZone", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/organizer`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test convex`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: organizer controls, activity touch, and automatic handover`.

---

### Task 7: Hand-off tokens

**Files:**
- Create: `convex/handoff.ts`
- Test: `convex/handoff.test.ts`

**Interfaces:**
- Consumes: `randomToken`, `sha256Hex`, `insertSession` (`sessions.ts`), `checkShardedRateLimit`, `cleanTimeZone`, `cleanDeviceLabel`.
- Produces:
  - `api.handoff.create` (action, `{ sessionToken }`) → `{ token: string } | { error: "not_signed_in" }`. It stores the hash with the caller's person and session, and `expiresAt = now + handoffTtlMs`.
  - `api.handoff.redeem` (action, `{ token: string; timeZone: string }`) → `{ sessionToken: string } | { error: "invalid" }`. It succeeds only when the token exists, hasn't been used, hasn't expired, and its creating session still exists. On success it sets `usedAt` and creates a session for the same person with `deviceLabel: "iPhone · الشاشة الرئيسية"`. It sends no WhatsApp message. Rate limit: `handoffRedeemGlobalPerMinute` (sharded). Any failure gives the same `invalid`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("redeem once gives a session for the same person; second redeem is invalid", async () => {});
test("expired after 30 minutes", async () => { /* advance 30 min + 1 ms → invalid */ });
test("dead after the creating session signs out", async () => {});
test("redeem sends no WhatsApp message", async () => { /* no scheduled whatsapp.sendText */ });
test("the new session appears in sessions.list with the home-screen label", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/handoff`. Expected: FAIL.
- [ ] **Step 3:** Implement. Never log the token.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: hand-off tokens for the iPhone home-screen app`.

---

### Task 8: WhatsApp link previews

**Files:**
- Create: `convex/preview.ts`, `apps/web/api/invite.ts`, `apps/web/src/lib/og.ts`, `scripts/render-images.ts`, `scripts/images/og.html`, `apps/web/public/og.png`
- Modify: `convex/http.ts`, `apps/web/vercel.json`, `apps/web/index.html` (default OG tags), `docs/deploy.md`
- Test: `convex/preview.test.ts`, `apps/web/src/lib/og.test.ts`

**Interfaces:**
- Consumes: `khatmaByInviteCode`, `doneCount`, `checkRateLimit`, `timingSafeEqual`.
- Produces:
  - `internal.preview.lookup` (internal query, `{ inviteCode: string; from: string | null }`) → `{ name: string | null; createdAt: number; done: number; round: number; inviterName: string | null } | null`.
  - `GET /api/preview?code=…&from=…` (Convex HTTP action):
    - Without a matching `X-Preview-Secret` header (env `PREVIEW_SECRET`) it answers 401.
    - It rate-limits per `X-Visitor-Ip` (`previewPerIpPerMinute`, key `preview:ip:<ip>`) and answers 429 over the limit.
    - It answers 200 with the lookup JSON, or 404.
  - `previewTags(p: PreviewData | null, pageUrl: string): { title: string; description: string; image: string; url: string }`:
    - Title is the name or `ختمة ${formatDate(createdAt)}`, then ` · وِردك`.
    - Description is `تمّ ${done} من ٣٠ جزءاً · الختمة ${round}`, plus ` · دعاك ${inviterName}` when present.
    - `null` gives title `وِردك` and description `نختم القرآن معاً، كل واحد يأخذ جزءاً.`.
    - `image` is always absolute: `new URL("/og.png", pageUrl).href`. WhatsApp ignores relative image paths.
  - `injectOg(html: string, tags): string`: replaces the block between `<!--og:start-->` and `<!--og:end-->` in `index.html` with `og:title`, `og:description`, `og:image`, `og:url`, `og:type=website`, `og:locale=ar_AR`, and a `<title>`. Every value is HTML-escaped.
  - `apps/web/api/invite.ts`: a Vercel Function, `export default { async fetch(request) }`. It:
    - reads `code` and `from`
    - fetches `${WIRDAK_CONVEX_SITE_URL}/api/preview` with the secret and `X-Visitor-Ip` (from `x-forwarded-for`), with a 1.5-second timeout
    - fetches its own `/index.html`, injects the tags, and returns `text/html` with `Cache-Control: public, max-age=0, s-maxage=300` for a real preview and `no-store` for the generic fallback, so a timeout or 429 is never cached at the edge
    - falls back to the generic tags on any error
  - `vercel.json` adds the rewrite `{ "source": "/j/:code", "destination": "/api/invite?code=:code" }` before the SPA catch-all. The query string, including `from`, passes through.
  - `scripts/render-images.ts` (run with `pnpm exec tsx scripts/render-images.ts`): renders each `scripts/images/*.html` at its declared size with Playwright and writes PNGs to `apps/web/public/`. `og.html` (1200x630) shows the misbaha ring and "وِردك" on the paper palette.

- [ ] **Step 1: Write the failing tests:**

```ts
test("previewTags with inviter and progress", () => {
  expect(previewTags({ name: "ختمة العائلة", createdAt: 0, done: 18, round: 4, inviterName: "أحمد" }, "https://wirdak.app/j/x").description).toBe("تمّ ١٨ من ٣٠ جزءاً · الختمة ٤ · دعاك أحمد");
});
test("injectOg escapes hostile names", () => {
  const html = injectOg(`<head><!--og:start--><!--og:end--></head>`, previewTags({ name: `"><script>x</script>&`, createdAt: 0, done: 0, round: 1, inviterName: null }, "u"));
  expect(html).not.toContain("<script>");
  expect(html).toContain("&quot;&gt;&lt;script&gt;");
});
test("generic tags for null", () => {});
test("og:image is absolute in both cases", () => { /* previewTags(…, "https://wirdak.app/j/x").image === "https://wirdak.app/og.png" */ });
test("preview endpoint: 401 without secret, 404 for unknown or reset codes, inviter only for a valid token, 429 over the limit", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/preview apps/web/src/lib/og`. Expected: FAIL.
- [ ] **Step 3:** Implement. Add `PREVIEW_SECRET` (Convex and Vercel) and `WIRDAK_CONVEX_SITE_URL` (Vercel) to `docs/deploy.md`.
- [ ] **Step 4:** Run tests. Expected: PASS. Run `pnpm --filter web build`. Expected: success.
- [ ] **Step 5: Commit** `feat: whatsapp link previews for invite links`.

---

### Task 9: Web push, the iPhone hand-off, icons, and touch

**Files:**
- Create: `apps/web/public/sw.js`, `apps/web/src/lib/push.ts`, `apps/web/src/lib/handoff.ts`, `apps/web/src/lib/useTouch.ts`, `apps/web/src/components/PushPromptSheet.tsx`, `apps/web/src/components/InstallStepsSheet.tsx`, `apps/web/src/features/handoff/HandoffGate.tsx`, `scripts/images/icon.html`, `apps/web/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/features/khatma/useKhatmaActions.ts` (prompt after the first take), `apps/web/public/manifest.webmanifest` (icons), `apps/web/index.html` (`apple-touch-icon`), `apps/web/src/i18n/ar.ts`
- Test: `apps/web/src/lib/push.test.ts`, `apps/web/src/lib/handoff.test.ts`, `apps/web/src/features/handoff/HandoffGate.test.tsx`, `apps/web/src/components/PushPromptSheet.test.tsx`

**Interfaces:**
- Consumes: Task 3 push API, Task 6 `people.touch`, Task 7 hand-off API.
- Produces:
  - **`sw.js`:**
    - `push` shows `showNotification(title, { body, data: { url }, icon: "/icons/icon-192.png", dir: "rtl", lang: "ar" })`
    - `notificationclick` focuses an open tab on `url` or opens one
    - `pushsubscriptionchange` re-subscribes and posts to the page
  - `pushSupport(nav = navigator, win = window): "ready" | "ios_install" | "unsupported"`:
    - `"ios_install"` for an iOS device that isn't standalone (`navigator.standalone !== true` and not `matchMedia("(display-mode: standalone)")`). An iOS device is an `iPhone`, `iPad`, or `iPod` user agent, or a `Macintosh` user agent with `navigator.maxTouchPoints > 1` (iPadOS Safari reports a desktop UA)
    - `"unsupported"` when `PushManager` or `serviceWorker` is missing
  - `isStandalone(): boolean`.
  - `enablePush(sessionToken: string): Promise<"granted" | "denied" | "unsupported">`: registers `/sw.js`, asks for permission, subscribes with the key from `api.push.publicKey`, and calls `api.push.subscribe`.
  - `syncPush(sessionToken: string): Promise<void>`: runs on app load (with `useTouch`) when signed in and `Notification.permission === "granted"`. It gets the current subscription and re-subscribes if there's none or its `applicationServerKey` differs from `api.push.publicKey` (VAPID rotation). Then it calls `api.push.subscribe`, an idempotent upsert. That keeps a browser renewal (`pushsubscriptionchange`) or a key rotation from silently ending push.
  - `pushAsked(): boolean` and `markPushAsked(): void` (key `wirdak.pushAsked`).
  - **After the first successful take**, while `!pushAsked()`:
    - `"ready"` opens `PushPromptSheet` with `نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً.`, "فعّل الإشعارات", and "ليس الآن"
    - `"ios_install"` opens `InstallStepsSheet`
    - either way, `markPushAsked()`
  - **`InstallStepsSheet`:**
    - On open it calls `api.handoff.create` and replaces `<link rel="manifest">` with a per-person manifest (a `blob:` or `data:` URL; use whichever iOS reads) whose `start_url` is `/?h=<token>`. The page's own address never changes, so sharing the page from the Share sheet can't leak the token.
    - Content: three illustrated steps (Share icon, "إضافة إلى الشاشة الرئيسية", "أضف"), with inline SVG and text labels.
    - On close it restores the original manifest link.
  - **`HandoffGate`:** wraps routes. If `?h=` is present and `isStandalone()`:
    - with a local session already, it strips `h` and does nothing else
    - otherwise it calls `redeem`, stores the token, strips `h`, then opens `PushPromptSheet`
    - on `invalid` it strips `h` and continues signed out
    - outside standalone mode it never redeems
  - `useTouch()` in `App`: when signed in, it calls `api.people.touch({ timeZone })` on load and when the page becomes visible, at most once an hour (key `wirdak.touchedAt`).
  - Icons: `scripts/images/icon.html` renders the ring motif. The manifest lists 192, 512, and maskable 512. `index.html` links `apple-touch-icon` (180).

- [ ] **Step 1: Write the failing tests:**

```ts
test("pushSupport", () => { /* iPhone Safari UA, not standalone → "ios_install"; Macintosh UA with maxTouchPoints 5 → "ios_install"; iPhone standalone with PushManager → "ready"; no serviceWorker → "unsupported" */ });
test("syncPush re-subscribes when the key changed and upserts the subscription", async () => {});
test("HandoffGate redeems only in standalone mode", async () => { /* Safari tab with ?h=tok → redeem not called; standalone → called once, token stored, h stripped */ });
test("HandoffGate keeps an existing session and does not redeem", async () => {});
test("HandoffGate on invalid token continues signed out", async () => {});
test("push prompt appears once after the first take", async () => {});
test("install sheet puts the token only in the manifest, never in location, and restores the manifest on close", async () => {});
```

- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run `pnpm exec tsx scripts/render-images.ts` and commit the PNGs.
- [ ] **Step 4:** Run tests. Expected: PASS. Then manually, against dev:
  - In desktop Chrome, enable push, take a juz', run `dev:forceGraceEnd` (Task 13) or wait for a short grace, and confirm a push arrives and tapping it opens the khatma.
  - **On a real iPhone (iOS 16.4 or later):** follow the install steps, open from the home screen, and confirm you're signed in without WhatsApp and the push prompt appears.
  - Confirm the home-screen app opened at the manifest's `start_url` with the token. If iOS ignored it, don't fall back to putting the token in the page address; say so in the PR and stop for Ali.
- [ ] **Step 5: Commit** `feat: web push, iphone hand-off, icons, and activity touch`.

---

### Task 10: Khatma page and create page: notes, grace, and switches

**Files:**
- Create: `apps/web/src/components/NoteCard.tsx`, `apps/web/src/components/GraceField.tsx`
- Modify: `apps/web/src/pages/KhatmaPage.tsx`, `apps/web/src/components/MainCard.tsx`, `apps/web/src/features/khatma/useKhatmaActions.ts`, `apps/web/src/pages/CreatePage.tsx`, `apps/web/src/pages/HomePage.tsx`, `apps/web/src/i18n/ar.ts`
- Test: `apps/web/src/components/NoteCard.test.tsx`, `apps/web/src/components/GraceField.test.tsx`, `apps/web/src/components/MainCard.test.tsx`, `apps/web/src/pages/CreatePage.test.tsx`, `apps/web/src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: `NoteView`, `noteText` (through `t.notes.text`), `api.notes.forKhatma` and `dismiss`, `api.pool.stillReading`, `api.khatmas.setNotifications`, `KhatmaView.me.hold`, `isOrganizer`, `mine.hasNote`, `Grace`, and `DEFAULT_GRACE`.
- Produces:
  - **`<NoteCard note onStillReading onFinish onRelease onTake onInvite onDismiss />`.** Its actions by kind:
    - `almostUp`: "ما زلت أقرأ", "أتممت القراءة", and the smaller "لا أستطيع إكماله"
    - `openForHelp`: "خذ الجزء" (opens the take sheet for the lowest listed juz' that is still open) and "أرسل الدعوة" (opens the share sheet)
    - `behind`: "خذ جزءاً" and "حسناً"
    - every other kind: "حسناً" (dismiss)
  - **KhatmaPage:**
    - members see their notes above the main card, newest first
    - an organizer link "إعدادات الختمة" goes to `/j/:inviteCode/settings` when `isOrganizer`
    - members get the switch "إشعارات هذه الختمة" with a visible on or off label
  - **MainCard:**
    - `hold.openForHelp` adds the line `يمكن لغيرك أن يساعد فيه الآن، ويمكنك إتمامه إن شئت.`
    - `hold.canExtend` adds "ما زلت أقرأ"
    - `hold.paceDays` adds `عادةً تُتمّ الجزء في نحو ${days}` (يوم / يومين / N أيام)
    - nothing shows time left
  - **Action results:**
    - `stillReading` ok shows the toast `أعطيناك وقتاً إضافياً. يسّر الله لك.`
    - `finish` with `taken_over` shows the toast `أحدهم يُكمل الجزء ${n} الآن. جزاكما الله خيراً.` and no undo
  - **`<GraceField value schedule onChange />`:**
    - collapsed: `مهلة كل جزء: ${formatGrace(value)} · تغيير`
    - expanded: a number input (`inputMode="numeric"`) and three unit buttons (دقائق / ساعات / أيام)
    - shows an inline error outside the limits
    - follows `DEFAULT_GRACE[schedule]` until edited
  - `formatGrace(g: Grace): string`, for example `٦ ساعات`, `يومان`, `٧ أيام`.
  - **CreatePage:** shows `GraceField` under the schedule options and sends `grace` only when edited.
  - **HomePage:** a card with `hasNote` shows a dot with the label "رسالة جديدة".

- [ ] **Step 1: Write the failing tests:**

```tsx
test("almostUp card offers still reading, finished, and can't finish", () => {});
test("openForHelp card take opens the take sheet for the first still-open juz", () => {});
test("main card never shows time left", () => { /* render with every hold combination; expect no /ساعة|دقيقة|متبقٍ|تأخر/ */ });
test("main card shows the open-for-help line and the extend button only when allowed", () => {});
test("finish taken_over shows the thanks toast without undo", async () => {});
test("GraceField follows the schedule default until edited and rejects 10 minutes", async () => {});
test("create sends grace only when edited", async () => {});
test("home shows the new-message label", () => {});
```

- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: notes, grace, and notification switches in the web app`.

---

### Task 11: Organizer page

**Files:**
- Create: `apps/web/src/pages/OrganizerPage.tsx`
- Modify: `apps/web/src/App.tsx` (route `/j/:inviteCode/settings`), `apps/web/src/i18n/ar.ts`
- Test: `apps/web/src/pages/OrganizerPage.test.tsx`

**Interfaces:**
- Consumes: Task 6 API, `GraceField`, `Sheet`, `ShareSheets` (invite sheet), `scheduleLabels`.
- Produces: `OrganizerPage`, with these sections in order:
  1. **Name** (save) and **schedule** (six options, with the note `يبدأ التغيير من الختمة القادمة`).
  2. **Grace:** `GraceField`, with `إن احتاج القارئ وقتاً أطول يستطيع طلبه مرة واحدة، وبعدها يمكن لغيرك أن يساعد.` and, when different, `المقترح لهذا الموعد: ${formatGrace(suggestedGrace)}`.
  3. **Members:** names only. Each has "اجعله المنظّم" and "إزالة", both behind a confirmation sheet. Removal confirmation: `سيعود جزؤه إلى الختمة، ولن يستطيع الانضمام مرة أخرى حتى تسمح له.`
  4. **Blocked:** each with "السماح بالعودة".
  5. **Reset the invite link:** confirm `الروابط القديمة ستتوقف عن العمل. أرسل الرابط الجديد إلى المجموعة.`, then navigate to the new code and open the invite sheet.
- `{ forbidden: true }` redirects to `/j/:inviteCode`.

- [ ] **Step 1: Write the failing tests:**

```tsx
test("non-organizer is sent back to the khatma", () => {});
test("member rows show names only and no reading data", () => {});
test("remove asks for confirmation first", async () => {});
test("reset navigates to the new code and opens the invite sheet", async () => {});
test("handover confirmation then returns to the khatma", async () => {});
```

- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: organizer page`.

---

### Task 12: Personal settings: numbers and push on this device

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/i18n/ar.ts`
- Test: `apps/web/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `api.people.myStats`, `pushSupport`, `enablePush`, `api.push.mine`, and `api.push.unsubscribe`.
- Produces: SettingsPage gains a "أرقامي" block, visible only to the person:
  - `قرأتَ ${juzRead} جزءاً`
  - `عادةً تُتمّ الجزء في نحو …` when `paceDays` isn't null
  - `${weekStreak} أسابيع متتالية تقرأ فيها` when `weekStreak` isn't null

  It also gains "الإشعارات على هذا الجهاز":
  - `"ready"` shows on or off with a button to switch
  - `"ios_install"` shows a button that opens `InstallStepsSheet`
  - `"unsupported"` shows `هذا المتصفح لا يدعم الإشعارات.`

- [ ] **Step 1: Write the failing tests:**

```tsx
test("numbers block hides pace and streak when null", () => {});
test("push section per support state", () => {});
```

- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: personal numbers and device notifications in settings`.

---

### Task 13: End-to-end test, dev helper, and deploy docs

**Files:**
- Modify: `convex/dev.ts`, `e2e/core-loop.spec.ts` or new `e2e/grace.spec.ts`, `e2e/support.ts`, `docs/deploy.md`, `README.md`
- Test: `e2e/grace.spec.ts`

**Interfaces:**
- Produces: `internal.dev.forceGraceEnd` (internal mutation, `{ inviteCode: string; juz: number }`). It runs `endDue` for the current hold of that juz' with its current `graceEndsAt`, and refuses unless `WIRDAK_ENV === "dev"`.

- [ ] **Step 1: Write the e2e test** at 390x844, on the local backend:
  1. A creates a weekly khatma, so A is the organizer.
  2. B joins through A's link and takes juz' 5.
  3. Run `forceGraceEnd` for juz' 5.
  4. A reloads. Tile 5 reads "متاح" with no name, and A sees the note `الجزء ٥ متاح لمن يساعد`.
  5. A takes juz' 5 from the note.
  6. B reloads and sees `أحدهم يُكمل الجزء ٥ الآن`.

  Then a second case: B taps "لا أستطيع إكماله" on another juz', and A's new note has the same wording.
- [ ] **Step 2:** Run `pnpm e2e`. Expected: PASS.
- [ ] **Step 3:** Update `docs/deploy.md`:
  - the new env vars (`VAPID_*`, `PREVIEW_SECRET`, `WIRDAK_CONVEX_SITE_URL`): where each is set and how to rotate it
  - Ali's checklist additions:
    - generate VAPID keys
    - set the preview secret on both sides
    - check a WhatsApp preview by pasting a real invite link
    - the real-iPhone hand-off and push check
  - the follow-up list, minus the items plan 2 closed (manifest icons, refreshing activity on views)
- [ ] **Step 4:** Run `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`. Expected: all PASS.
- [ ] **Step 5: Commit** `chore: plan 2 e2e, dev helper, and deploy docs`.

---

## Self-review notes

- **Spec coverage:**
  - 3.1 grace and defaults: Tasks 1, 2, 10, 11
  - 3.2 night pause: Task 1
  - 3.3 steps 1-6: Task 4, with UI in Task 10
  - 3.4 rules (release alert, one at a time, races, undo, grace changes, no-deadline, `releasedBySystem`): Task 4
  - 3.5 removal of the old release rule: Task 2 settings and Task 4
  - 4.1 pace: Task 5, shown in Tasks 10 and 12
  - 4.2 reminder: Task 5
  - 4.3 behind: Task 5
  - 4.4 personal numbers: Tasks 5, 12
  - 4.5 limits: Task 5
  - 5.1 notes: Tasks 3, 10
  - 5.2 push: Tasks 3, 9, 12
  - 5.3 messages: Task 3 (`noteText`), Tasks 4-6
  - 5.4 hand-off: Tasks 7, 9
  - 6 organizer controls: Tasks 6, 11
  - 6.3 automatic handover: Task 6
  - 7 previews: Task 8
  - 8.1 create: Task 10
  - 8.3 touch: Tasks 6, 9; icons: Task 9
  - 8.4 scheduling and time zones: Tasks 1, 4
  - 9 settings: Task 2
  - 10 data: Task 2
  - 11 privacy: Tasks 3, 6, 8
  - 12 cases 1-17: Tasks 1, 4, 5, 6, 7, 13
- **Known risk:** how iOS picks the home-screen launch address (Task 9, Step 4). That step proves it on a real phone before the PR merges.
