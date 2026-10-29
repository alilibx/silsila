# Rotating khatma, plan 1: the rota core, run by the organizer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-enabled organizer creates a rotating khatma, places people on ajza', and runs each reading day (progress, reassigning, marking done, pausing) on the website. Members' WhatsApp comes in plan 2.

**Architecture:** A rotating khatma is a `khatmas` row with `kind: "rota"` and a `rota` config object, so invite codes, `/j/:inviteCode`, the home list, the organizer's `members` row and admin lookup keep working. Four new tables hold participants, slots, reading days and each day's 30 reads. A 15-minute cron ticks every active rota khatma: it starts the day at the juz' message time, closes the previous one, sends the organizer's in-app notes, and archives after the end date. The calendar arithmetic is pure, in `convex/lib/rota.ts`.

**Tech Stack:** Convex (convex-test + vitest), React 19 + react-router + Tailwind 4 (`apps/web`, `apps/admin`), Bun, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-wirdak-rotating-khatma-design.md`. Plan 1 covers spec sections 2.1, 3, 6 (except join links and requests), the admin switch, cap and defaults of 10, and the end date half of 9. Plan 2 (members on WhatsApp: 4, 5, 7) and plan 3 (8, the rest of 9, 10.1, 10.2) follow.

**Naming:** code says **rota** (`kind: "rota"`, `rotaDays`, `lib/rota.ts`). "rotation" is taken: `rotationLookbackRounds` is the pool's juz' suggestion. Arabic copy says «ختمة بالتناوب».

## Global Constraints

- Pool khatma behavior doesn't change. Every pool test still passes.
- Every time is in the khatma's `rota.timeZone`, which starts as the organizer's `people.timeZone`.
- Message times are minutes after local midnight, multiples of 15, and must fall in waking hours: `quietEndHour*60 <= t` and `t < quietStartHour*60` (07:00 to 21:45 with today's 22/7). Order: `dayAt < reminder.at < unread.at < summary.at` (only between those that are on, plus `dayAt` always).
- Defaults (admin settings): `dayAt` 480 (08:00), reminder 960 (16:00, on), unread list 1140 (19:00, on), summary 1260 (21:00, off).
- Cap: `rotaMaxActivePerOrganizer` = 2 active (not archived) rota khatmas per organizer. `rotaMaxSlotsPerPerson` = 3 [plan's call].
- Only people with `people.rotaAllowed === true` can create one. Admins switch it, and each switch is audited (`person.rotaAllowed`).
- No WhatsApp sends in plan 1. Organizer notes are in-app and push only (`NOTE_TEMPLATES[kind] = null`).
- Copy: plain Arabic, one question per setup screen, big fields (`min-h-14`), defaults preselected (spec 2.1). All strings live in `apps/web/src/i18n/ar.ts` (`t.rota.*`) or `apps/admin/src/i18n/ar.ts`.
- `bun run typecheck`, `bun run lint`, `bun run test` pass after every task. No new dependencies.
- Commits: Conventional Commits, `Refs: ARQ-287` line, no AI attribution of any kind (repo `CLAUDE.md`).

## Review Focus

1. **A day boundary across a pause or a late tick.** The cron runs late (deploy, outage) or the organizer pauses mid-day: no reading day may be started twice, skipped silently while not paused, or numbered out of order. Test: two ticks in the same minute start one day; a tick at 09:10 still starts that date's day; a tick the next date never backfills yesterday (Task 4).
2. **Placing a person while a day is open.** The People page targets the next khatma not yet started, so a placement never shifts today's 30 reads. Test: with day 12 open, adding to juz' 7 places them on khatma 13's juz' 7, and today's read for juz' 7 is unchanged (Task 3).
3. **Changing reading days or pause dates after the start.** The count carries on from the last started day; khatma 1's date can't move once passed. Test: switching daily → weekly after day 5 makes the next started day number 6 (Task 6).
4. **Time zones and DST.** `instantAt` must land on the wall-clock minute in zones with DST. Test: `instantAt("2027-03-14", 480, "America/New_York")` is 08:00 local after the spring-forward (Task 1).
5. **Phone numbers typed by an 80-year-old.** Arabic digits, spaces, `00` prefix, dashes. Test: `normalizePhone("٠٠٩٧١ ٥٠-١٢٣ ٤٥٦٧") === "+971501234567"`, and `"0501234567"` is refused (no country code) (Task 3).

---

### Task 1: Rota calendar and arithmetic (pure)

**Files:**
- Create: `convex/lib/rota.ts`
- Modify: `convex/lib/wakingTime.ts` (export `localDate`, `localMinutes`, `instantAt`)
- Test: `convex/lib/rota.test.ts`

**Interfaces:**
- Produces (all exported from `convex/lib/rota.ts`):
  - `type ReadingDays = { kind: "daily" } | { kind: "weekly"; weekdays: number[]; everyWeeks: 1 | 2 } | { kind: "monthly"; days: number[] }` (weekday 0 = Sunday … 6 = Saturday; days 1–31)
  - `readingDaysValidator` (Convex validator for the union above)
  - `type RotaMessages = { dayAt: number; reminder: { at: number; on: boolean }; unread: { at: number; on: boolean }; summary: { at: number; on: boolean } }` and `rotaMessagesValidator`
  - `ROTA_SIZE = 30`
  - `khatmaNumber(n: number): number` → `((n - 1) % 30) + 1`
  - `cycleOf(n: number): number` → `Math.floor((n - 1) / 30) + 1`
  - `juzFor(slot: number, number: number): number` → `((slot - 1 + number - 1) % 30) + 1`
  - `slotFor(juz: number, number: number): number` (inverse of `juzFor`)
  - `isReadingDate(days: ReadingDays, firstDate: string, date: string): boolean` (dates are `YYYY-MM-DD`; false before `firstDate`)
  - `nextReadingDates(days: ReadingDays, firstDate: string, from: string, count: number, skip: ReadonlySet<string>): string[]` (inclusive of `from`, skips `skip`, scans at most 800 days)
  - `addDays(date: string, n: number): string`
  - `isValidReadingDays(days: ReadingDays): boolean` (weekly: 1–7 distinct weekdays 0–6; monthly: 1–31 distinct days in 1–31, at least one)
  - `messageTimesError(m: RotaMessages, quietStartHour: number, quietEndHour: number): "step" | "quiet" | "order" | null`
- Produces (`convex/lib/wakingTime.ts`): `localDate(at: number, tz: string): string`, `localMinutes(at: number, tz: string): number`, `instantAt(date: string, minutes: number, tz: string): number`.

- [ ] **Step 1: Write the failing tests** in `convex/lib/rota.test.ts`:

```ts
test("khatma number and cycle wrap at 30", () => {
  expect([1, 30, 31, 60, 61].map(khatmaNumber)).toEqual([1, 30, 1, 30, 1]);
  expect([1, 30, 31, 61].map(cycleOf)).toEqual([1, 1, 2, 3]);
});
test("each slot moves up one juz' per khatma and 30 wraps to 1", () => {
  expect(juzFor(7, 1)).toBe(7);
  expect(juzFor(7, 2)).toBe(8);
  expect(juzFor(30, 2)).toBe(1);
  expect(juzFor(7, 30)).toBe(6);
  for (let juz = 1; juz <= 30; juz++)
    for (const n of [1, 12, 30]) expect(juzFor(slotFor(juz, n), n)).toBe(juz);
});
test("daily, weekly (every week and every two weeks) and monthly reading dates", () => {
  const daily = { kind: "daily" } as const;
  expect(isReadingDate(daily, "2026-10-30", "2026-10-29")).toBe(false);
  expect(nextReadingDates(daily, "2026-10-30", "2026-10-30", 3, new Set())).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  const fridays = { kind: "weekly", weekdays: [5], everyWeeks: 1 } as const;
  expect(nextReadingDates(fridays, "2026-10-30", "2026-10-30", 3, new Set())).toEqual(["2026-10-30", "2026-11-06", "2026-11-13"]);
  const otherFriday = { kind: "weekly", weekdays: [5], everyWeeks: 2 } as const;
  expect(nextReadingDates(otherFriday, "2026-10-30", "2026-10-30", 3, new Set())).toEqual(["2026-10-30", "2026-11-13", "2026-11-27"]);
  const monThu = { kind: "weekly", weekdays: [1, 4], everyWeeks: 2 } as const; // first date a Thursday
  expect(nextReadingDates(monThu, "2026-10-29", "2026-10-29", 4, new Set())).toEqual(["2026-10-29", "2026-11-02", "2026-11-12", "2026-11-16"]);
  const monthly = { kind: "monthly", days: [1, 31] } as const;
  expect(nextReadingDates(monthly, "2026-10-31", "2026-10-31", 3, new Set())).toEqual(["2026-10-31", "2026-11-01", "2026-12-01"]);
});
test("paused dates are skipped", () => {
  expect(nextReadingDates({ kind: "daily" }, "2026-10-30", "2026-10-30", 2, new Set(["2026-10-31"]))).toEqual(["2026-10-30", "2026-11-01"]);
});
test("message times: steps, quiet hours and order", () => {
  const ok = { dayAt: 480, reminder: { at: 960, on: true }, unread: { at: 1140, on: true }, summary: { at: 1260, on: false } };
  expect(messageTimesError(ok, 22, 7)).toBeNull();
  expect(messageTimesError({ ...ok, dayAt: 485 }, 22, 7)).toBe("step");
  expect(messageTimesError({ ...ok, dayAt: 360 }, 22, 7)).toBe("quiet");
  expect(messageTimesError({ ...ok, summary: { at: 1320, on: true } }, 22, 7)).toBe("quiet");
  expect(messageTimesError({ ...ok, reminder: { at: 1200, on: true } }, 22, 7)).toBe("order");
  expect(messageTimesError({ ...ok, reminder: { at: 1200, on: false } }, 22, 7)).toBeNull();
});
```

And in `convex/lib/wakingTime.test.ts` (existing file, add):

```ts
test("local date, minutes and the instant of a wall-clock minute", () => {
  const at = Date.UTC(2026, 9, 29, 20, 30); // 00:30 on 30 Oct in Dubai
  expect(localDate(at, "Asia/Dubai")).toBe("2026-10-30");
  expect(localMinutes(at, "Asia/Dubai")).toBe(30);
  expect(instantAt("2026-10-30", 480, "Asia/Dubai")).toBe(Date.UTC(2026, 9, 30, 4, 0));
  expect(instantAt("2027-03-14", 480, "America/New_York")).toBe(Date.UTC(2027, 2, 14, 12, 0));
});
```

- [ ] **Step 2: Run and see them fail.** `bun run test convex/lib/rota.test.ts convex/lib/wakingTime.test.ts` → FAIL (missing exports).
- [ ] **Step 3: Implement.** In `wakingTime.ts`, build the three exports on the private `wallClock` and `localToInstant` (add a `minute` parameter to `localToInstant`, default 0). In `rota.ts`, do date math on `YYYY-MM-DD` with `Date.UTC` day numbers. Every-two-weeks: a weekday counts when `Math.floor((day(date) - day(firstDate)) / 7)` is even.
- [ ] **Step 4: Run the tests.** Same command → PASS. Then `bun run typecheck && bun run lint`.
- [ ] **Step 5: Commit.** `feat(convex): add the rota calendar and arithmetic`

### Task 2: Schema, settings, and the pool's guards

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/settings.ts`, `convex/lib/settingSpecs.ts`, `convex/lib/audit.ts`, `convex/lib/noteText.ts`, `convex/lib/whatsappTemplates.ts`, `convex/organizer.ts` (auto handover), `convex/khatmas.ts` (`view`, `mine`), `apps/admin/src/components/SettingField.tsx`, `apps/admin/src/lib/formatSetting.ts`, `apps/admin/src/i18n/ar.ts`
- Test: `convex/schema.test.ts`, `convex/lib/settingSpecs.test.ts`, `convex/organizer.test.ts`, `convex/khatmas.test.ts`, `apps/admin/src/lib/formatSetting.test.ts`, `apps/admin/src/components/SettingField.test.tsx`

**Interfaces:**
- Consumes: `readingDaysValidator`, `rotaMessagesValidator` (Task 1).
- Produces:
  - `khatmas`: `kind: v.optional(v.literal("rota"))` (missing = pool), `rota: v.optional(rotaConfigValidator)`, index `by_kind` on `["kind"]`. A rota khatma stores `schedule: "none"`, `grace: DEFAULT_GRACE.none`, no `currentRoundId`, `completedRounds: 0`.
  - `rotaConfigValidator` exported from `convex/lib/rota.ts`: `{ days: ReadingDays, firstDate: string, endDate: string | null, timeZone: string, messages: RotaMessages, pausedAt: number | null, pauseDates: string[], archivedAt: number | null }`.
  - `people.rotaAllowed: v.optional(v.boolean())`.
  - `rotaParticipants`: `{ khatmaId, name: string, phone: string (E.164), personId: Id<"people"> | null, addedAt: number, removedAt: number | null }`, indexes `by_khatma` `["khatmaId"]`, `by_khatma_phone` `["khatmaId", "phone"]`.
  - `rotaSlots`: `{ khatmaId, slot: number, participantId }`, indexes `by_khatma_slot` `["khatmaId", "slot"]`, `by_participant` `["participantId"]`.
  - `rotaDays`: `{ khatmaId, n: number, number: number, cycle: number, date: string, startedAt: number, closesAt: number, completedAt: number | null, closedAt: number | null, unreadSentAt: number | null, summarySentAt: number | null }`, indexes `by_khatma_n` `["khatmaId", "n"]`, `by_khatma_date` `["khatmaId", "date"]`.
  - `rotaReads`: `{ dayId, khatmaId, juz: number, slot: number, holderId: Id<"rotaParticipants"> | null, readerId: Id<"rotaParticipants"> | null, doneAt: number | null, doneByOrganizer: boolean, reassignedAt: number | null }`, indexes `by_day_juz` `["dayId", "juz"]`, `by_reader_day` `["readerId", "dayId"]`.
  - Settings (defaults in `SETTING_DEFAULTS`, group `"rota"` in specs, new spec kind `{ kind: "time" }` = minutes 0–1425 in steps of 15): `rotaDayAt: 480`, `rotaReminderAt: 960`, `rotaReminderOn: true`, `rotaUnreadAt: 1140`, `rotaUnreadOn: true`, `rotaSummaryAt: 1260`, `rotaSummaryOn: false`, `rotaMaxActivePerOrganizer: 2` (int 1–20), `rotaMaxSlotsPerPerson: 3` (int 1–30), `rotaSilenceNoticeDays: 3` (int 1–30), `rotaSilenceStopDays: 7` (int 2–60). (The silence settings are read in plan 2.)
  - Audit: action `"person.rotaAllowed"`.
  - Note kinds `"rotaUnread"` (juz: the unread ajza') and `"rotaSummary"` (count: ajza' done that day, juz: unread). `noteText`: `rotaUnread` → «لم تُسجَّل بعد قراءة ${الجزء/الأجزاء} ${juzList} في ختمة اليوم.» (singular/plural like `openForHelp`); `rotaSummary` → «ختمة اليوم: ${count} من ٣٠ جزءاً تمّت.» Both `NOTE_TEMPLATES` entries `null`.
  - `khatmas.view` returns `{ rota: true }` for a rota khatma (before the `currentRoundId` check). `khatmas.mine` cards gain `kind: "pool" | "rota"`; a rota card's `done` is the open day's done count (0 with no open day) and `holding` is null.
  - `autoHandoverSweep` skips rota khatmas.

- [ ] **Step 1: Write the failing tests.**
  - `settingSpecs.test.ts`: every `rota*` key has a spec; a `time` value of 485 or 1440 is rejected, 480 accepted.
  - `khatmas.test.ts`: `view` on a rota khatma row returns `{ rota: true }`; `mine` returns `kind: "rota"` with `done: 0` and `holding: null` for an organizer member of one.
  - `organizer.test.ts`: `autoHandoverSweep` schedules nothing for a rota khatma whose organizer is away 60 days.
  - `formatSetting.test.ts`: `time` 480 formats as «٨:٠٠ ص», 1260 as «٩:٠٠ م».
  - `SettingField.test.tsx`: a `time` setting renders a select of 15-minute steps and saves minutes.
- [ ] **Step 2: Run them.** `bun run test convex apps/admin` → the new tests FAIL.
- [ ] **Step 3: Implement** the schema, settings, specs, audit action, note kinds (schema `notes.kind` union too), the `view`/`mine` branches and the handover skip. The admin settings page lists the new `rota` group with its Arabic group title «الختمة بالتناوب».
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(convex): add the rota tables, settings and note kinds`

### Task 3: Create a rota khatma and place people

**Files:**
- Create: `convex/rota.ts`, `convex/lib/rotaPlace.ts` (target khatma and slot helpers)
- Modify: `convex/lib/text.ts` (`normalizePhone`)
- Test: `convex/rota.create.test.ts`, `convex/rota.people.test.ts`, `convex/lib/text.test.ts`

**Interfaces:**
- Consumes: Task 1 and Task 2 exports; `randomToken`, `cleanKhatmaName`, `checkRateLimit`, `getSetting`, `sessionMutation/sessionQuery`, `requireOrganizer` (`convex/organizer.ts`).
- Produces:
  - `normalizePhone(raw: string): string | null` in `convex/lib/text.ts`: normalizes Arabic and Persian digits, strips spaces, dashes, dots and brackets, turns a leading `00` into `+`, and returns `+` plus 8–15 digits, else null.
  - `rota.create` (action, like `khatmas.create`): args `{ sessionToken?, name: string, days: ReadingDays, firstDate: string, endDate: string | null }` → `{ inviteCode: string }`. Errors (`ConvexError` codes): `not_signed_in`, `rota_not_allowed`, `rota_cap`, `invalid_days`, `invalid_dates` (first date before today in the organizer's zone, end before first, or first not a reading date), `maintenance`, `rate_limited`. Inserts the khatma (config from Task 2 with messages from the settings defaults, `timeZone` from the person), the organizer's `members` row (active, notifications on, a share token), and the organizer as participant 1 on slot 1 (their `displayName`, `phone`, `personId`). Schedules `internal.rotaDays.tick({ khatmaId })` at once (late start, spec 3.4).
  - `targetDay(ctx, khatma): Promise<{ n: number; number: number; date: string | null; started: false }>` in `convex/lib/rotaPlace.ts`: the next reading day not yet started. `n` is the last started day's `n + 1` (1 if none). `date` is the first of `nextReadingDates(days, firstDate, max(today, firstDate), 1, pauseDates)` that has no `rotaDays` row, or null when paused now.
  - `rota.people` (sessionQuery, organizer only, else `null`): args `{ inviteCode }` → `{ target: { number: number; date: string | null; isFirst: boolean }, rows: Array<{ juz: number; participant: { id: Id<"rotaParticipants">; name: string; isMe: boolean; slots: number } | null }>, participants: Array<{ id; name; isMe: boolean; juz: number[] }>, freeJuz: number[], maxSlots: number }`. `rows` has 30 entries in juz' order for the target khatma.
  - `rota.addParticipant` (sessionMutation, organizer): args `{ inviteCode, name: string, phone: string, juz?: number }` → `{ ok: true; participantId; juz: number } | { error: "bad_name" | "bad_phone" | "no_free_juz" | "juz_taken" | "already_added" }`. Without `juz`, takes the lowest free juz' of the target khatma. The slot stored is `slotFor(juz, target.number)`.
  - `rota.giveJuz` (organizer): `{ inviteCode, participantId, juz }` → `{ ok: true } | { error: "juz_taken" | "too_many" | "not_found" }` (another slot for an existing participant; `too_many` at `rotaMaxSlotsPerPerson`).
  - `rota.moveJuz` (organizer): `{ inviteCode, participantId, fromJuz, toJuz }` → `{ ok: true } | { error: "not_found" }`. If `toJuz` is held, the two slots swap holders.
  - `rota.freeJuz` (organizer): `{ inviteCode, juz }` → `{ ok: true } | { error: "not_found" }` (the slot loses its holder).
  - `rota.removeParticipant` (organizer): `{ inviteCode, participantId }` → `{ ok: true } | { error: "not_found" | "is_me" }`. Deletes their slots and sets `removedAt`. Today's reads keep their reader.

- [ ] **Step 1: Write the failing tests.**
  - `text.test.ts`: `normalizePhone("+971 50 123 4567") === "+971501234567"`, `normalizePhone("٠٠٩٧١ ٥٠-١٢٣ ٤٥٦٧") === "+971501234567"`, `normalizePhone("0501234567") === null`, `normalizePhone("+12") === null`.
  - `rota.create.test.ts`: creates with `rotaAllowed`, giving `kind: "rota"`, the organizer as participant on slot 1, and an organizer `members` row; refuses without `rotaAllowed` (`rota_not_allowed`); refuses a third active one (`rota_cap`); refuses a first date yesterday, an end before the first date, and a Saturday first date for a Fridays-only khatma (`invalid_dates`); with first date today at 15:00 (after 08:00) a `rotaDays` row for today exists after `t.finishAllScheduledFunctions(vi.runAllTimers)`.
  - `rota.people.test.ts`: before the start, `addParticipant` without `juz` fills juz' 2, 3, 4 in order and `rows[1].participant.name` is the first added; `juz_taken` for a held juz'; `already_added` for the same phone; `giveJuz` up to 3 then `too_many`; `moveJuz` onto a held juz' swaps; `removeParticipant` frees their ajza' and refuses the organizer (`is_me`); a non-organizer's `people` is null and their mutations throw `forbidden`. **Review Focus 2:** with day 12 started (insert `rotaDays` n=12 and its reads), adding to juz' 7 stores `slotFor(7, 13)`, and day 12's juz'-7 read keeps its reader.
- [ ] **Step 2: Run them.** `bun run test convex/rota convex/lib/text.test.ts` → FAIL.
- [ ] **Step 3: Implement** `convex/rota.ts` and `convex/lib/rotaPlace.ts`. `create` follows `khatmas.create`'s action → internal mutation retry for the invite code.
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(convex): create a rota khatma and place people on ajza'`

### Task 4: The reading day engine

**Files:**
- Create: `convex/rotaDays.ts`
- Modify: `convex/crons.ts`
- Test: `convex/rotaDays.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `notify` (`convex/notes.ts`).
- Produces:
  - `rotaDays.sweep` (internalMutation, no args): for every `kind: "rota"` khatma (`by_kind`) without `rota.archivedAt`, schedules `tick`. Cron: `crons.cron("tick rotating khatmas", "*/15 * * * *", internal.rotaDays.sweep, {})`.
  - `rotaDays.tick` (internalMutation `{ khatmaId }`), in this order, all idempotent:
    1. **Close** the open day (`closedAt === null`) when `now >= closesAt`.
    2. **Start** today's day when all hold: not archived, `pausedAt === null`, `today = localDate(now, tz)` is a reading date, not in `pauseDates`, `today >= firstDate`, no `rotaDays` row with `date === today`, and `localMinutes >= dayAt`. A still-open previous day is closed first. The new row has `n = last.n + 1` (1 if none), `number`, `cycle`, `startedAt: now`, `closesAt: instantAt(addDays(today, 1), dayAt, tz)`. It inserts 30 `rotaReads`, one per juz': `slot = slotFor(juz, number)`, `holderId = readerId =` that slot's participant or null.
    3. **Organizer notes** for the open day dated today: when `unread.on`, `localMinutes >= unread.at`, `unreadSentAt === null` and not complete, `notify` the organizer `rotaUnread` with the unread ajza' (holder-less included) and stamp `unreadSentAt`. The same for `summary` → `rotaSummary` with `count` done, stamped `summarySentAt`, sent even when complete.
    4. **Archive** when `endDate !== null`, `today > endDate` and no day is open: set `rota.archivedAt = now`.
  - `completeIfDone(ctx, dayId): Promise<boolean>` exported from `convex/rotaDays.ts`: sets `completedAt` when all 30 reads are done; returns whether it just completed. (Plan 2 hangs the dua on it.)

- [ ] **Step 1: Write the failing tests** (fake timers; Dubai; a daily khatma whose first date is tomorrow; helpers `tickAt(localIso)` that sets the system time and runs `tick`).
  - Nothing starts at 07:59; day 1 starts at 08:00 with 30 reads, the organizer reading juz' 1 and 29 holder-less reads; `closesAt` is the next day at 08:00.
  - **Review Focus 1:** two ticks at 08:00 start one day; a first tick at 09:10 still starts that date's day as n=1; with the service down all of day 2, a tick on day 3 at 08:00 starts n=2 dated day 3 (no backfill).
  - The next day the old day closes and n=2 starts with every slot moved up one juz'.
  - `pauseDates: [day 2]` → day 2 starts nothing, and day 3 is n=2. `pausedAt` set → nothing starts; cleared → the next date starts n=next.
  - A Fridays khatma starts only on Fridays.
  - At 19:00 the organizer gets one `rotaUnread` note listing the unread ajza'; a second tick sends no second one; with `unread.on: false`, none. At 21:00 with `summary.on: true`, one `rotaSummary` with `count`.
  - End date: the day after `endDate` closes, the khatma gets `archivedAt`, and `sweep` no longer ticks it.
  - `completeIfDone` returns true once, when the 30th read is done.
- [ ] **Step 2: Run them.** `bun run test convex/rotaDays.test.ts` → FAIL.
- [ ] **Step 3: Implement** `convex/rotaDays.ts` and the cron.
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(convex): start, close and archive rota reading days`

### Task 5: Today: progress, reassigning and marking done

**Files:**
- Modify: `convex/rota.ts`
- Test: `convex/rota.today.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 (`completeIfDone`).
- Produces:
  - `rota.today` (sessionQuery, organizer only, else null): `{ inviteCode }` → `{ day: { number; cycle; date; doneCount: number; completedAt: number | null } | null, next: { number: number; date: string | null }, paused: boolean, archived: boolean, tiles: Array<{ readId: Id<"rotaReads">; juz: number; state: "done" | "unread" | "reassigned"; holderName: string | null; readerName: string | null; readerId: Id<"rotaParticipants"> | null }>, participants: Array<{ id; name; isMe: boolean; doneToday: boolean }> }`. `day` is the open day (or today's closed one). `reassigned` = not done and `readerId !== holderId`.
  - `rota.reassign` (organizer): `{ inviteCode, readId, participantId }` → `{ ok: true } | { error: "not_found" | "closed" | "done" }`. Sets `readerId`, `reassignedAt`.
  - `rota.markDone` (organizer): `{ inviteCode, readId }` → `{ ok: true; completed: boolean } | { error: "not_found" | "closed" }`. Sets `doneAt`, `doneByOrganizer: true`, then `completeIfDone`.
  - `rota.markNotDone` (organizer): `{ inviteCode, readId }` → `{ ok: true } | { error: "not_found" | "closed" }`. Clears `doneAt` (and `completedAt` if it was set).

- [ ] **Step 1: Write the failing tests:** tiles and counts after a start; reassigning juz' 8 to another participant shows `reassigned` with both names; reassigning to the organizer's own participant works («سأقرؤه أنا»); `markDone` on all 30 returns `completed: true` once and sets `day.completedAt`; `markNotDone` undoes it; actions on a closed day return `closed`; a non-organizer gets null and `forbidden`.
- [ ] **Step 2: Run them.** `bun run test convex/rota.today.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `convex/rota.ts`.
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(convex): let the organizer reassign and mark rota ajza' done`

### Task 6: Rota settings: pause, dates, messages, days

**Files:**
- Modify: `convex/rota.ts`
- Test: `convex/rota.settings.test.ts`

**Interfaces:**
- Produces:
  - `rota.settings` (organizer query): `{ inviteCode }` → `{ name: string | null; days: ReadingDays; firstDate: string; firstDatePassed: boolean; endDate: string | null; timeZone: string; messages: RotaMessages; pausedAt: number | null; pauseDates: string[]; upcoming: string[] /* next 8 reading dates, for the pause-date picker */; quiet: { startHour: number; endHour: number } }`.
  - `rota.update` (organizer): `{ inviteCode, name?: string | null, days?: ReadingDays, firstDate?: string, endDate?: string | null, timeZone?: string, messages?: RotaMessages }` → `{ ok: true } | { error: "invalid_days" | "invalid_dates" | "first_date_passed" | "invalid_times" | "invalid_zone" }`. Times are checked with `messageTimesError` against the live quiet hours. A first date that has passed can't change.
  - `rota.setPaused` (organizer): `{ inviteCode, paused: boolean }` → `{ ok: true }`.
  - `rota.addPauseDate` / `rota.removePauseDate` (organizer): `{ inviteCode, date }` → `{ ok: true } | { error: "not_reading_date" | "past" }`. Adding a date that is already started (has a `rotaDays` row) returns `past`.

- [ ] **Step 1: Write the failing tests:** each error; **Review Focus 3:** after day 5 started, switching daily → Fridays makes the next started day (a Friday) n=6 with juz' moved up one from day 5; pausing now skips days until resumed; a pause date added then removed restores that date.
- [ ] **Step 2: Run them.** `bun run test convex/rota.settings.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(convex): rota settings, pausing and message times`

### Task 7: Web: create a rotating khatma (two screens)

**Files:**
- Create: `apps/web/src/pages/RotaCreatePage.tsx`, `apps/web/src/features/rota/ReadingDaysField.tsx`, `apps/web/src/features/rota/RotaPeopleSetup.tsx`, `apps/web/src/features/rota/format.ts` (dates and times in Arabic)
- Modify: `apps/web/src/App.tsx` (routes), `apps/web/src/pages/CreatePage.tsx` (type cards), `apps/web/src/i18n/ar.ts` (`t.rota`), `convex/people.ts` (expose `rotaAllowed` to the signed-in person in the existing "me" query, or add `people.me` if none exists)
- Test: `apps/web/src/pages/RotaCreatePage.test.tsx`, `apps/web/src/features/rota/ReadingDaysField.test.tsx`, `apps/web/src/features/rota/format.test.ts`, `apps/web/src/pages/CreatePage.test.tsx`

**Interfaces:**
- Consumes: `api.rota.create`, `api.rota.people`, `api.rota.addParticipant`, `api.rota.giveJuz`.
- Produces: routes `/new/rota` (step 1) and `/j/:inviteCode/setup` (step 2). `formatTime(minutes): string` («٨:٠٠ ص»), `formatIsoDate(date): string` («الجمعة ٣٠ أكتوبر»).

Screens (spec 6.1, mockups `simple-setup-v4.html` and `simple-setup-v3.html`):
1. `/new`: for `rotaAllowed` people, two big cards first: «ختمة بالحجز» (today's form) and «ختمة بالتناوب» (→ `/new/rota`). Others see today's page unchanged.
2. `/new/rota`: progress bar 1 of 2; «ما اسم الختمة؟»; «متى تقرؤون؟» with «كل يوم» (chosen), «كل أسبوع» (weekday chips Saturday→Friday with Friday preselected, then «كل أسبوع» / «كل أسبوعين»), «كل شهر» (day-of-month chips 1–31); «نبدأ» line (tomorrow by default) and «ننتهي» line («تستمر دائماً» by default), each with «تغيير» opening a native date input; «التالي» calls `create` and goes to `/j/:code/setup`. Errors map to `t.rota.errors[code]`.
3. `/j/:code/setup`: progress bar 2 of 2; name field, number field (`inputMode="tel"`, hint «مع رمز الدولة، مثل ‎+971»), «أضف»; the list in order with the organizer first («أنا»); a banner when ajza' are left («بقي جزءان بلا قارئ (٢٩ و٣٠)») whose tap opens a sheet to pick who reads each leftover juz' too (`giveJuz`); a big «تمّ» button to the khatma page. (Plan 2 turns «تمّ» into the join-link share.)

- [ ] **Step 1: Write the failing tests:** `/new` shows the two cards only when `rotaAllowed`; step 1 sends `{ name, days: { kind: "daily" }, firstDate: <tomorrow>, endDate: null }` by default and `{ kind: "weekly", weekdays: [5], everyWeeks: 1 }` after choosing «كل أسبوع»; an error code shows its message; step 2 adds two people in order and shows them as 2 and 3; the leftover banner reads 28 free with 2 people; `formatTime(480) === "٨:٠٠ ص"`, `formatTime(1260) === "٩:٠٠ م"`.
- [ ] **Step 2: Run them.** `bun run test apps/web` → the new tests FAIL.
- [ ] **Step 3: Implement.** Reuse `Button`, `Sheet`, and the radio-card styles from `CreatePage`.
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(web): create a rotating khatma in two screens`

### Task 8: Web: the rota khatma page (Today, People, Settings)

**Files:**
- Create: `apps/web/src/pages/RotaKhatmaPage.tsx`, `apps/web/src/features/rota/TodayPanel.tsx`, `apps/web/src/features/rota/PeoplePanel.tsx`, `apps/web/src/pages/RotaSettingsPage.tsx`, `apps/web/src/features/rota/TimeField.tsx`
- Modify: `apps/web/src/pages/KhatmaPage.tsx` (render `RotaKhatmaPage` when `view` is `{ rota: true }`), `apps/web/src/pages/OrganizerPage.tsx` (render `RotaSettingsPage` for a rota khatma), `apps/web/src/pages/HomePage.tsx` and `apps/web/src/components/SwitchKhatmaSheet.tsx` (rota card: «ختمة بالتناوب · ٢٦ من ٣٠ اليوم»), `apps/web/src/i18n/ar.ts`
- Test: `apps/web/src/pages/RotaKhatmaPage.test.tsx`, `apps/web/src/pages/RotaSettingsPage.test.tsx`, `apps/web/src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: `api.rota.today`, `api.rota.people`, `api.rota.settings` and every rota mutation from Tasks 3, 5 and 6.

Screens (spec 6.2–6.5, mockups `organizer-flow-v2.html`, `full-flow.html` sections D and F):
- Tabs «اليوم» and «المشاركون» (URL `?tab=people`, same pattern as `KhatmaTabs`), and the settings link the pool page uses.
- **Today:** header «الختمة ١٢ · الثلاثاء ١٠ نوفمبر» and the cycle when > 1 («الدورة ٢»); «٢٧ / ٣٠» and «التالي: الختمة ١٣ · غداً ٨:٠٠ ص»; a paused banner; the 6×5 grid (done green, unread dashed, reassigned saffron). Tapping unread or reassigned opens a sheet: who holds it and who reads it, «أسنده إلى مشارك» (participant list, those done today marked «أتمّ جزأه اليوم»), «سأقرؤه أنا», «سجّله تامّاً». Tapping done opens «ليس بعد؟ ألغِ التسجيل» (`markNotDone`). With no open day: «تبدأ الختمة ١ يوم … الساعة …».
- **People:** the banner from `people.target` («جزء كل مشارك في الختمة ١» before the start, else «الختمة ١٣ يوم … هذا جزء كل مشارك فيها»); 30 rows; tapping an empty row opens the add sheet (name and number, as in setup, sentence «يقرأ الجزء ٧ في الختمة ١٣، ثم ٨ في الختمة ١٤، وهكذا»); tapping a filled row opens: move to another juz' (select of 1–30, saying «سيتبادل مع …» when held), «أعطه جزءاً آخر», «أزله من الختمة» (confirm).
- **Settings:** «الإيقاف» card (pause-now switch with its hint, pause dates as removable chips plus «+ تاريخ» from `upcoming`); «الرسائل» card: four `TimeField` rows (15-minute select between quiet hours) with switches, the first locked on; reading days (`ReadingDaysField`), end date, name, time zone (select of the zones `Intl.supportedValuesOf("timeZone")` offers, default shown first). Errors map to `t.rota.errors`.
- **Non-organizer members and visitors:** a short page: the khatma title and «هذه الختمة تعمل على واتساب. يصلك جزؤك كل يوم مع زرّين.» (plan 2 adds the join button).

- [ ] **Step 1: Write the failing tests:** today renders 30 tiles with the right states and counts; reassign sends `{ readId, participantId }`; «سأقرؤه أنا» sends the organizer's participant; people tab renders the banner and 30 rows, the add sheet sends `{ name, phone, juz: 7 }`; settings pause switch calls `setPaused`; a time change sends `messages` with the new minutes; a non-organizer sees the WhatsApp page; home shows a rota card's line.
- [ ] **Step 2: Run them.** `bun run test apps/web` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(web): run a rotating khatma day by day`

### Task 9: Admin: the switch, and rota khatmas in the khatma view

**Files:**
- Modify: `convex/adminOps.ts` (`setRotaAllowed`), `convex/adminLookup.ts` (`person.rotaAllowed`; `khatma` gains `kind` and, for rota, `rota: { days, firstDate, endDate, pausedAt, archivedAt, number, cycle, doneToday }`), `apps/admin/src/pages/PersonAdminPage.tsx`, `apps/admin/src/pages/KhatmaAdminPage.tsx`, `apps/admin/src/i18n/ar.ts`
- Test: `convex/adminOps.test.ts`, `apps/admin/src/pages/PersonAdminPage.test.tsx`, `apps/admin/src/pages/KhatmaAdminPage.test.tsx`

**Interfaces:**
- Produces: `adminOps.setRotaAllowed` (adminMutation): `{ adminToken, personId, allowed: boolean }` → `{ ok: true } | { error: "not_found" }`, writing audit `person.rotaAllowed` with `before`/`after`.
- Person page: a switch row «يمكنه إنشاء ختمة بالتناوب» with a confirm sheet. Khatma page: «النوع: بالتناوب», reading days, «الختمة ١٢ · الدورة ١», «٢٧ / ٣٠ اليوم», paused or archived.

- [ ] **Step 1: Write the failing tests:** the mutation flips the flag and writes one audit row; the person page switch calls it; the khatma page shows the rota lines for a rota khatma and nothing new for a pool one.
- [ ] **Step 2: Run them.** `bun run test convex/adminOps.test.ts apps/admin` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run typecheck && bun run lint && bun run test` → PASS.
- [ ] **Step 5: Commit.** `feat(admin): turn rotating khatmas on per person`

### Task 10: End-to-end: create, place, and run a day

**Files:**
- Modify: `convex/dev.ts` (a dev-only `allowRota({ phone })` internal mutation, refused unless `WIRDAK_ENV` is `dev`, following the file's existing guard), `e2e/support.ts` (a helper that calls it)
- Create: `e2e/rota.spec.ts`

- [ ] **Step 1: Write the test:** person A verifies, gets `rotaAllowed`, creates a daily rotating khatma starting today (so day 1 starts at once if past 08:00 in the browser's zone; otherwise assert «تبدأ الختمة ١ …»), adds two people, opens Today, reassigns one unread juz' to themselves and marks it done, sees «١ / ٣٠» increase, pauses in settings and sees the paused banner.
- [ ] **Step 2: Run it** against the local stack the suite already uses: `bun run e2e e2e/rota.spec.ts --project=chromium` → PASS.
- [ ] **Step 3: Commit.** `test(e2e): create and run a rotating khatma`
