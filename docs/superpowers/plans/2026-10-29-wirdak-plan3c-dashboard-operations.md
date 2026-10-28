# Wirdak plan 3c: dashboard, morning summary, milestones, lookups and operations, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the admin home page into the dashboard from the brainstorm mockup. Push a morning summary and milestones to admins. Let admins find a khatma or a person and fix things: sign someone out everywhere, block or unblock a number, reset an invite link, and hand over the organizer role. With this, plan 3 and v1's admin panel are complete.

**Architecture:**
- **Daily rollup.** One `dailyStats` row per Dubai day holds that day's counts and running totals. A cron writes it just after midnight Dubai time, from index ranges over one day. Totals add up day by day, so nothing ever scans a whole table at request time.
- **Sign-in counts** go into `counters` when a sign-in starts and when it succeeds, because verifications are purged after a day.
- **Live numbers** read narrow index ranges over `rounds` and `assignments`:
  - active khatmas
  - stalled khatmas
  - days per round
  - today's ajza'
- **Admin pushes.** The summary and milestone pushes reuse 3b's admin push, with a per-admin switch for each kind.
- **Operations** reuse the organizer's own code for invite resets and handovers, through helpers extracted from `organizer.ts`. Every operation is audited.

**Tech Stack:** Convex (crons, search index, `convex-test`), React 19, Tailwind 4, Vitest 5. The trend chart is hand-made SVG, with no chart library.

**Spec:** `docs/superpowers/specs/2026-10-28-wirdak-plan3-design.md`, sections 6, 7 and 8, and items 11 to 14 of section 13. Plans 3a and 3b are the foundation:
- `adminQuery` / `adminMutation`, `writeAudit({ actor, … })`, and `SETTING_SPECS`
- `adminPush.deliveryPlan`, `sendToSubscriptions`, and `AdminPushCard`
- `deleteSession`, `notify`, and `normalizeAdminPhone`

## Global Constraints

- **Group totals only.** No chart, list, or ranking shows one person's reading, and khatmas aren't ranked either. A khatma's page shows its pool as counts (free, taken, finished), not who holds which juz'. A person's page shows their account, not their pace.
- **Days are Dubai days:** `localDayNumber(at, "Asia/Dubai")` from `convex/lib/wakingTime.ts`. Dubai has no daylight saving, so a day starts at `day * 86_400_000 - 4 * 3_600_000`.
- **No query reads an unbounded table to draw a number.** Each reads one day's index range, one 14- or 30-day range of rounds, or rows already rolled up.
- **Definitions:**
  - **Active khatma:** a juz' was finished in it in the last 14 days.
  - **Stalled khatma:** its current round is open, it has at least one active member, and nothing has been finished in it for 14 days. If nothing was ever finished, count from when the round started.
  - **Days per round:** the median number of days to complete a round, over rounds completed in the last 30 days.
  - **Sign-in success:** over the last 7 days, sign-ins completed divided by sign-ins started.
- **Milestones:**
  - Khatmas: 10, 50, 100, 250, 500, 1,000, then every 1,000.
  - Members: 100, 500, 1,000, 5,000, 10,000, then every 10,000.
  - Completed khatmas: 1, 10, 100, 1,000, then every 1,000.

  Each fires once per deployment. At most one milestone push goes out per spacing window. The backfill marks milestones already passed as sent.
- **Push text** is generic and never names a person or khatma. The summary text is fixed by Task 5.
- **Audit.** Every operation writes an audit row in the same transaction, with the admin's optional note.
- **A blocked number** gets the same "no code found" reply as a wrong code, and blocking signs it out everywhere.
- Arabic copy in `apps/admin/src/i18n/ar.ts`. No AI attribution. Conventional Commits ending `Refs: ARQ-270`.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass after every task. Regenerate `convex/_generated/api.d.ts` after adding a Convex module, with `bunx convex codegen` or the plan 3a script.

## Review Focus

1. **A day with no activity.** `rollupDay` still writes a row, with zero counts and the totals carried over, so the chart has no gaps and the totals don't reset. Test: Task 3.
2. **The rollup running twice for the same day** (a cron retry). It upserts, so it never doubles a total. Test: Task 3.
3. **The first deploy, with no `dailyStats` yet.** The dashboard shows today's live numbers with zero totals until the backfill runs, and never throws. Test: Task 4.
4. **Blocking the number of a person who is signed in** on several devices, or is an organizer. Sessions and push go at once. The khatmas stay, and organizer roles aren't touched. Test: Task 6.
5. **Two milestones crossed between checks** (a burst of sign-ups). Both are marked sent, and only the highest is pushed. Test: Task 5.

---

### Task 1: Schema, settings, and audit actions

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/audit.ts`, `convex/lib/settings.ts`, `convex/lib/settingSpecs.ts`, `apps/admin/src/i18n/ar.ts` (labels and actions are `Record`s)
- Test: extend `convex/lib/settings.test.ts`, `convex/lib/settingSpecs.test.ts`

**Interfaces:**
- **Tables:**
  - `dailyStats`
    - Fields: `day: number` (Dubai day number), `ajzaFinished`, `newMembers`, `newKhatmas`, `roundsCompleted`, `signInsStarted`, `signInsCompleted`, `totalMembers`, `totalKhatmas`, `totalRoundsCompleted`, and `computedAt`. All are numbers.
    - Index: `by_day` `["day"]`.
  - `counters`: `{ key: string, value: number }`, index `by_key`. Keys look like `signin:<day>:started` and `signin:<day>:completed`.
  - `milestonesSent`: `{ metric: "khatmas" | "members" | "completed", value: number, sentAt: number }`, index `by_metric_value` `["metric", "value"]`.
  - `blockedPhones`: `{ phone: string, blockedBy: Id<"admins">, at: number, note: string | null }`, index `by_phone`.
- **New indexes on existing tables:**
  - `rounds.by_lastFinishedAt` `["lastFinishedAt"]`
  - `rounds.by_completedAt` `["completedAt"]`
  - `rounds.by_open_lastFinishedAt` `["completedAt", "lastFinishedAt"]`
  - `assignments.by_finishedAt` `["finishedAt"]`
  - `khatmas.searchIndex("search_name", { searchField: "name" })`
- **`admins`** gains `notifySummary: v.optional(v.boolean())` and `notifyMilestones: v.optional(v.boolean())`. Absent means on.
- **Audit:**
  - `auditActionValidator` gains `person.signOutAll`, `phone.block`, `phone.unblock`, `khatma.resetInvite`, and `khatma.handOver`.
  - `targetKind` gains `"person"`, `"khatma"`, and `"phone"`.
- **Settings** (group `"notifications"`):

  | Key | Default | Kind | Range |
  |---|---|---|---|
  | `summaryHour` | 8 | hour | 0 to 23 (Dubai time) |
  | `milestonePushSpacingMs` | 60 seconds | duration | 10 seconds to 1 hour |

- **Admin copy:**
  - Labels: `"ساعة الملخص الصباحي (بتوقيت دبي)"` and `"أقل مدة بين تنبيهي إنجاز"`.
  - Action names, in order: `"أنهى كل جلسات شخص"`, `"حظر رقماً"`, `"ألغى حظر رقم"`, `"أعاد ضبط رابط دعوة"`, `"سلّم دور المنظّم"`.

- [ ] **Step 1: Write the failing tests.** Add the two new defaults to "defaults match the spec". Then check two values: `validateSetting("milestonePushSpacingMs", 5_000)` is `out_of_range`, and `validateSetting("summaryHour", 8)` is null.
- [ ] **Step 2: Run them and see them fail.** `bun run test convex/lib/settings convex/lib/settingSpecs`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite.** `bun run test && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add stats, counters, milestones and blocked-number tables`.

### Task 2: Sign-in counters, and blocked numbers in the WhatsApp path

**Files:**
- Create: `convex/lib/stats.ts`
- Modify: `convex/verification.ts` (`createPending`, `matchIncoming`, `claimInternal`, `confirmPinInternal`)
- Test: `convex/lib/stats.test.ts`, extend `convex/verification.test.ts`

**Interfaces:**
- **`convex/lib/stats.ts`:**
  - `STATS_TZ = "Asia/Dubai"`
  - `dubaiDay(at: number): number`, through `localDayNumber`
  - `dayStart(day: number): number`, which is `day * DAY_MS - 4 * HOUR_MS`
  - `bumpCounter(ctx: MutationCtx, key: string, by = 1): Promise<void>`
  - `readCounter(ctx: QueryCtx, key: string): Promise<number>`
- **`createPending`** (website surface only) bumps `signin:<day>:started`.
- **`claimInternal` and `confirmPinInternal`** bump `signin:<day>:completed` when the result is `ok`. Admin sign-ins aren't counted, because the spec's number is about members.
- **`matchIncoming`:**
  - When `blockedPhones` has the sender, it returns `{ kind: "no_match", codeShaped: false }`. That gives the "no code found" reply and no relay.
  - It checks this after the per-phone limit and before the code lookup, so a blocked number can't use up someone else's pending code.
  - It applies to admin surfaces too.

- [ ] **Step 1: Write the failing tests:**
  - **Days.** `dubaiDay` of `2026-10-29T19:59:59Z` and of `2026-10-29T20:00:00Z` are consecutive days, because midnight in Dubai is 20:00 UTC. `dayStart(dubaiDay(t)) <= t`.
  - **Counting.** A website start, then a claim (the new-number path), gives counters `started 1` and `completed 1`. An admin-surface start bumps neither.
  - **Blocked number.** A message from a blocked phone with a valid pending code gets `NO_MATCH_REPLY`. The pending verification stays `pending`, and nothing is relayed. Check that the relay fetch isn't called.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: count sign-ins per day and turn away blocked numbers`.

### Task 3: The daily rollup and the backfill

**Files:**
- Create: `convex/stats.ts`
- Modify: `convex/crons.ts`
- Test: `convex/stats.test.ts`

**Interfaces:**
- **`dayCounts(ctx: QueryCtx, day: number)`**, an internal helper. It returns `{ ajzaFinished, newMembers, newKhatmas, roundsCompleted, signInsStarted, signInsCompleted }` for `[dayStart(day), dayStart(day + 1))`:
  - `ajzaFinished` comes from `assignments.by_finishedAt`.
  - `newMembers` and `newKhatmas` come from `people` and `khatmas` by `_creationTime`, the built-in `by_creation_time` index.
  - `roundsCompleted` comes from `rounds.by_completedAt`.
  - The sign-in numbers come from the counters.
- **`rollupDay`** (`internalMutation`, args `{ day: number }`):
  - It upserts the `dailyStats` row for `day`.
  - Totals are the previous day's row's totals plus this day's counts, or this day's counts alone when there's no previous row.
  - Running it again for the same day gives the same row.
  - Afterwards it deletes that day's sign-in counters.
- **`rollupYesterday`** (`internalMutation`) calls `rollupDay` for `dubaiDay(now) - 1`. The cron runs it daily at 20:10 UTC, which is 00:10 Dubai.
- **`backfill`** (`internalAction`, no args, run once from the command line with `bun run convex run stats:backfill`):
  - It finds the first day: the Dubai day of the oldest `people` or `khatmas` row.
  - It runs `rollupDay` for each day up to yesterday, one mutation per day, in order.
  - Then it runs `markPassedMilestones` (Task 5).
  - Sign-in counts before launch are zero, because verifications were purged long ago. The spec accepts this.

- [ ] **Step 1: Write the failing tests:**
  - **One day.** Seed two finishes, one person, and one khatma on day D, plus a finish on D+1. `rollupDay(D)` writes counts 2/1/1, totals `totalMembers 1, totalKhatmas 1`, and a completed-rounds total from the seeded rounds.
  - **Gaps and totals (Review Focus 1).** `rollupDay(D+1)` carries the totals forward. A day with nothing still writes a row with zero counts and the same totals.
  - **Reruns (Review Focus 2).** `rollupDay(D)` twice gives one row, with the same totals.
  - **Counters.** Counters are deleted after their day rolls up.
  - **Backfill.** It writes one row per day from the first day to yesterday, and the last row's totals equal the seeded totals.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Regenerate `api.d.ts`.
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: roll up daily stats and backfill them`.

### Task 4: Dashboard queries

**Files:**
- Create: `convex/adminStats.ts`
- Test: `convex/adminStats.test.ts`

**Interfaces:**
- **`overview`** (`adminQuery`) returns:

  ```ts
  {
    activeKhatmas: number;
    activeKhatmasWeekAgo: number | null;
    members: number;
    membersNewThisWeek: number;
    ajzaToday: number;
    ajzaAvg7: number;              // over the last 7 rolled-up days, one decimal
    completedThisWeek: number;     // rounds completed in the last 7 days (6 rolled-up days + today)
    stalledKhatmas: number;        // capped at 500; `stalledCapped` says so
    stalledCapped: boolean;
    daysPerRoundMedian: number | null;  // null without a completed round in 30 days
    signInSuccess7: number | null;      // 0..1, null when nothing started
  }
  ```

  - `members` is the latest `dailyStats.totalMembers` plus today's live `newMembers` (Review Focus 3: zero totals without rows).
  - `activeKhatmas` is the number of distinct `khatmaId`s in `rounds.by_lastFinishedAt` with `lastFinishedAt > now - 14d`.
  - `activeKhatmasWeekAgo` is the same count for the window ending 7 days ago, or null when there's nothing to compare.
  - `stalledKhatmas`: open rounds, read through `by_open_lastFinishedAt` with `eq("completedAt", null).lt("lastFinishedAt", now - 14d)`, taking at most 500. A null `lastFinishedAt` sorts first, so those rounds are filtered by `startedAt < now - 14d`. Only current rounds count (`khatma.currentRoundId === round._id`), and only khatmas with at least one active member.
- **`trend`** (`adminQuery`, args `{ metric: "ajzaFinished" | "newMembers" | "newKhatmas" | "roundsCompleted" | "signInRate", days: 7 | 30 | 365 }`) → `Array<{ day: number; value: number | null }>`. It returns one entry per day, oldest first, ending yesterday, with null for a day that has no row. `signInRate` is completed ÷ started for that day, or null when nothing started.

- [ ] **Step 1: Write the failing tests:**
  - **Empty start (Review Focus 3).** Without any `dailyStats`, `overview` returns zeros and nulls, and doesn't throw.
  - **Active.** A khatma finished in 3 days ago counts as active. One finished in 20 days ago doesn't.
  - **Stalled.** These count as stalled:
    - an open round whose last finish was 15 days ago
    - an open round with no finish, started 15 days ago

    These don't:
    - a round started 3 days ago
    - a khatma with no active members
  - **Days per round.** Completed rounds of 2, 4 and 10 days give a median of 4.
  - **Sign-in success.** 8 starts and 6 completions over the week give 0.75.
  - **Trend.** `trend({ metric: "ajzaFinished", days: 7 })` returns 7 entries with null for missing days.
  - **Not admins.** A member token gives `not_admin`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Regenerate `api.d.ts`.
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add dashboard queries for totals, trends and health`.

### Task 5: The morning summary and milestone pushes

**Files:**
- Modify: `convex/adminPush.ts` (generic plan by kind, and switches), `convex/pushNode.ts` (`deliverToAdmins` accepts any kind), `convex/stats.ts` (`morningSummary`, `checkMilestones`, `markPassedMilestones`), `convex/crons.ts`
- Test: extend `convex/adminPush.test.ts`, `convex/stats.test.ts`

**Interfaces:**
- **`adminPush.deliveryPlan`** becomes args `{ kind: "request" | "message" | "summary" | "milestone", requestId?: Id<"helpRequests">, body?: string }`. It filters by `notifyHelp`, `notifySummary`, or `notifyMilestones`, depending on the kind.
  - Summary and milestone payloads: `{ title: "وِردك · الإدارة", body, url: "/", tag: "summary-<day>" | "milestone-<metric>-<value>" }`.
  - The body comes from the caller and contains only totals.
- **`adminPush.setNotify`** (`adminMutation`, args `{ kind: "help" | "summary" | "milestones", on: boolean }`) replaces `setNotifyHelp` and keeps its behavior. `mine` also returns `notifySummary` and `notifyMilestones`.
- **`stats.morningSummary`** (`internalMutation`), run hourly by cron:
  - When the Dubai hour equals `summaryHour` and counter `summary:<day>` is 0, it bumps that counter.
  - It then schedules `deliverToAdmins` with kind `summary` and the yesterday row's numbers plus the open help count.
  - Body, verbatim, with Arabic digits: `` `أمس: ${newKhatmas} ختمة جديدة · ${newMembers} عضواً جديداً · ${ajzaFinished} جزءاً · ${roundsCompleted} ختمة مكتملة · طلبات مساعدة مفتوحة: ${openHelp}` ``
  - With no row for yesterday, it sends nothing.
- **`stats.checkMilestones`** (`internalMutation`), run by cron every 10 minutes:
  - It computes the three totals: latest totals plus today's live counts.
  - For each metric, it takes the milestones at or below the total that aren't in `milestonesSent`, and inserts them all.
  - It pushes only the highest one, and only when the last milestone push was more than `milestonePushSpacingMs` ago. That time is counter `milestone:lastPushAt`. Otherwise the milestone stays marked and isn't pushed (Review Focus 5).
  - Body: `` `🎉 وصلنا ${value} ${noun}` ``, where `noun` is `ختمة`, `عضو`, or `ختمة مكتملة`, followed by a newline and the other two totals.
- **`stats.markPassedMilestones`** (`internalMutation`) marks every milestone at or below the current totals as sent, without pushing. The backfill calls it.
- **`milestonesFor(metric, total): number[]`**, an exported pure function, follows the sequences in the Global Constraints.

- [ ] **Step 1: Write the failing tests:**
  - **Milestone sequences.** `milestonesFor("khatmas", 260)` is `[10, 50, 100, 250]`. `milestonesFor("members", 25_000)` ends with `[…, 10_000, 20_000]`. `milestonesFor("completed", 1)` is `[1]`.
  - **Two at once (Review Focus 5).** Totals cross 50 and 100 between checks: both are inserted, and one push for 100 is scheduled.
  - **Spacing.** A second crossing within the spacing window is marked but not pushed.
  - **Backfill.** `markPassedMilestones` pushes nothing.
  - **Summary.** `morningSummary` at 08:xx Dubai schedules one summary push. At 09:xx, or a second run at 08:xx, it schedules none.
  - **Switches.** `deliveryPlan` for `summary` leaves out admins with `notifySummary: false`. `setNotify({ kind: "help", on: false })` behaves like the old `setNotifyHelp`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Update `AdminPushCard`'s call from `setNotifyHelp` to `setNotify({ kind: "help" })` so the build stays green. Task 9 adds the new switches.
- [ ] **Step 4: Run the tests.** `bun run test && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: push a morning summary and milestones to admins`.

### Task 6: Lookups and operations (backend)

**Files:**
- Create: `convex/adminLookup.ts`, `convex/adminOps.ts`
- Modify: `convex/organizer.ts` (extract `resetInviteCode(ctx, khatma, newCode, shareTokens)` and `handOverTo(ctx, khatma, member, previousOrganizer)` from `applyInviteReset` and `handOver` / `autoHandover`, so that admins and organizers run the same code)
- Test: `convex/adminLookup.test.ts`, `convex/adminOps.test.ts`; the existing `organizer.test.ts` must stay green unchanged

**Interfaces:**
- **`adminLookup.findKhatmas`** (`adminQuery`, args `{ query: string }`) returns up to 20 `{ khatmaId, name, inviteCode, members: number }`.
  - An exact invite code match comes first.
  - Then results from the `search_name` index.
  - Trimmed input under 2 characters gives `[]`.
- **`adminLookup.findPerson`** (`adminQuery`, args `{ phone: string }`) → `{ personId, displayName, phone } | null | { error: "invalid_phone" }`. It uses `normalizeAdminPhone`. It also returns `blocked: boolean` for a number that has no person.
- **`adminLookup.khatma`** (`adminQuery`, args `{ khatmaId }`) returns:
  - `name`, `inviteCode`, `schedule`, `grace`, `createdAt`, and `completedRounds`
  - `organizer: { personId, displayName }`
  - `members: Array<{ memberId, personId, displayName, joinedAt, status }>`
  - `round: { number, startedAt, free, taken, finished } | null`, as counts only
  - `openHelpRequests: number`

  It returns no assignment holders and no paces.
- **`adminLookup.person`** (`adminQuery`, args `{ personId }`) returns:
  - `displayName`, `phone`, `timeZone`, `verifiedAt`, `lastSeenAt`
  - `khatmas: Array<{ khatmaId, name, inviteCode, isOrganizer, status }>`
  - `sessions: Array<{ deviceLabel, lastUsedAt }>`
  - `helpRequests: Array<{ requestId, status, lastMessageAt }>`, at most 20
  - `blocked: boolean`
- **`adminOps.signOutEverywhere`** (`adminMutation`, args `{ personId, note? }`) → `{ ended: number }`. It deletes every session through `deleteSession` (which also removes push subscriptions and hand-off tokens). Audit: `person.signOutAll`, `before: { sessions: n }`.
- **`adminOps.blockPhone`** (`adminMutation`, args `{ phone, note? }`) → `{ ok: true } | { error: "invalid_phone" | "already_blocked" }`. It inserts `blockedPhones`, and signs out the person with that phone if there is one. Audit: `phone.block`, `targetKind: "phone"`, `targetId: phone`.
- **`adminOps.unblockPhone`** (`adminMutation`, args `{ phone, note? }`) → `{ ok: true } | { error: "not_blocked" }`. Audit: `phone.unblock`.
- **`adminOps.resetInvite`** (`action`, args `{ adminToken, khatmaId, note? }`) → `{ inviteCode } | { error: "not_found" }`.
  - It retries `adminOps.applyInviteReset` (`internalMutation`, which checks the admin itself) with fresh random codes, like `organizer.resetInvite`.
  - Audit inside the mutation: `khatma.resetInvite`, with the old and new codes as before and after.
- **`adminOps.handOver`** (`adminMutation`, args `{ khatmaId, memberId, note? }`) → `{ ok: true } | { error: "not_member" | "self" }`. It uses `handOverTo`. The new organizer gets `nowOrganizer`, and the old one gets `organizerMoved`. Audit: `khatma.handOver`, with the organizer's `personId` before and after.

- [ ] **Step 1: Write the failing tests:**
  - **Search.** `findKhatmas` finds by exact invite code and by a word in the name, and returns `[]` for "ا".
  - **Khatma page.** `khatma` returns pool counts that match the seeded assignments, and its JSON contains no `personId` of an assignment holder.
  - **Person page.** `person` lists the sessions and khatmas, with the organizer flag.
  - **Sign out everywhere.** It ends all 3 sessions and deletes their push subscriptions, and writes the audit row with the note.
  - **Blocking (Review Focus 4).** `blockPhone` on a signed-in organizer ends their sessions, and the khatma's organizer is unchanged. The second block gives `already_blocked`. `unblockPhone` removes the row, and both write audit rows.
  - **Invite reset.** `resetInvite` changes the code, gives active members new share tokens, and writes old and new codes to the audit log.
  - **Handover.** `handOver` moves the organizer and creates both notes. The organizer themself gives `self`, and a removed member gives `not_member`.
  - **Not admins.** A member token on each function gives `not_admin`.
- [ ] **Step 2: Run them and see them fail.** Then confirm `bun run test convex/organizer.test.ts` still passes after the extraction.
- [ ] **Step 3: Implement.** Regenerate `api.d.ts`.
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: let admins look up khatmas and people and fix their accounts`.

### Task 7: The dashboard (admin home page)

**Files:**
- Create: `apps/admin/src/components/StatTile.tsx`, `apps/admin/src/components/TrendChart.tsx`
- Modify: `apps/admin/src/pages/HomePage.tsx`, `apps/admin/src/i18n/ar.ts` (`t.stats`)
- Test: `apps/admin/src/components/TrendChart.test.tsx`, `apps/admin/src/pages/HomePage.test.tsx`

**Interfaces:**
- **Load the `dataviz` skill before writing the chart.**
- **Home page order:**
  1. The open-help card (from 3b).
  2. A two-column grid of six `StatTile`s, in this order: active khatmas (with the change against a week ago), members (+ new this week), ajza' today (with the 7-day average), completed this week, stalled khatmas, and days per round.
  3. The `TrendChart`.
  4. The sign-in success card. Below 0.8 it shows in saffron, as a warning.
  5. The push card (`AdminPushCard`).
  6. The quick switches (maintenance and announcement), now at the bottom.
- **`StatTile`:** `{ label: string; value: string; detail?: string; tone?: "normal" | "warn" }`.
- **`TrendChart`:**
  - Props: `{ points: Array<{ day: number; value: number | null }>; format(v: number): string; label: string }`.
  - It's an inline SVG bar chart, sized by `viewBox`, with RTL-friendly labels and the theme's colors only.
  - A null day is drawn as an empty slot, not as zero.
  - It has an accessible summary: `role="img"` and `aria-label`, with the latest value and the period.
- **Controls above the chart:**
  - A segmented control for 7 days, 30 days, and a year.
  - A metric picker: ajza', new members, new khatmas, rounds completed, sign-in success.
- **Formatting:** numbers in Arabic digits. Days per round, for example "٤ أيام", through `formatDuration` from `apps/admin/src/lib/formatSetting.ts`. Sign-in success as "٩٢٪".

- [ ] **Step 1: Write the failing tests:**
  - **Chart.** `TrendChart` renders one bar per non-null point and an empty slot for a null one. Its `aria-label` contains the last value.
  - **Home page.** With a mocked `overview`, it shows the six tiles' values in Arabic digits. With sign-in success of 0.7, the card uses the warning tone. With null days per round, it shows "—".
  - **Switching.** Changing the period or metric changes `trend`'s arguments.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test apps/admin && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: show the admin dashboard with totals, trends and sign-in health`.

### Task 8: Search, khatma and person pages (admin)

**Files:**
- Create: `apps/admin/src/pages/SearchPage.tsx`, `KhatmaAdminPage.tsx`, `PersonAdminPage.tsx`, `apps/admin/src/components/ConfirmSheet.tsx` (a confirm sheet with an optional note)
- Modify: `apps/admin/src/App.tsx` (routes `/search`, `/khatmas/:khatmaId`, `/people/:personId`), `apps/admin/src/components/Layout.tsx` (nav "بحث" after المساعدة), `apps/admin/src/pages/HelpRequestPage.tsx` (the person and khatma now link to their admin pages, instead of `tel:` and the website), `apps/admin/src/i18n/ar.ts` (`t.lookup`, `t.ops`)
- Test: `SearchPage.test.tsx`, `KhatmaAdminPage.test.tsx`, `PersonAdminPage.test.tsx`

**Interfaces:**
- **`SearchPage`** has two forms:
  - Khatma: an invite code or name, with results linking to `/khatmas/:id`.
  - Person: a phone number. It goes straight to `/people/:id`. With no person, it says "no account with this number", shows whether the number is blocked, and offers block or unblock.
- **`KhatmaAdminPage`** shows:
  - the facts, the organizer (linked), and the members (each linked)
  - the round's pool as three numbers
  - the open help count
  - actions: reset invite link, and hand over (a member picker inside the sheet)
- **`PersonAdminPage`** shows:
  - the facts
  - their khatmas (linked, with "منظّم" when they organize one)
  - their devices (label and last used)
  - their help requests (linked to `/help/:id`)
  - actions: sign out everywhere, and block or unblock

  It shows no reading data.
- **`ConfirmSheet`:** `{ title, body, confirmLabel, onConfirm(note: string | undefined) }`. It has an optional note field, "ملاحظة (اختياري)", that goes to the audit log.
- **Copy, verbatim:**
  - `t.ops.signOutAll`: "إنهاء كل الجلسات"
  - `t.ops.block`: "حظر الرقم"
  - `t.ops.unblock`: "إلغاء الحظر"
  - `t.ops.resetInvite`: "إعادة ضبط رابط الدعوة"
  - `t.ops.handOver`: "تسليم دور المنظّم"
  - `t.ops.noteLabel`: "ملاحظة (اختياري)"
  - Each action's confirm body says what happens. For example, block reads: "لن يستطيع هذا الرقم الدخول، وتنتهي كل جلساته الآن."

- [ ] **Step 1: Write the failing tests:**
  - **Search.** A phone search navigates to the person page.
  - **Khatma page.** It shows the three pool counts and no names of holders. Reset asks for confirmation, then calls the action with the note.
  - **Person page.** "Sign out everywhere" calls `signOutEverywhere` after confirming. A blocked person shows "unblock" instead of "block".
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test apps/admin && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add search, khatma and person pages with admin operations`.

### Task 9: Summary and milestone switches, and the docs

**Files:**
- Modify: `apps/admin/src/components/AdminPushCard.tsx` (three switches: help, summary, milestones), `apps/admin/src/i18n/ar.ts`, `docs/deploy.md` (the backfill command, and what the crons do)
- Test: extend `apps/admin/src/components/AdminPushCard.test.tsx`

**Interfaces:**
- **Switch copy:** "الملخص الصباحي" and "تنبيهات الإنجازات". Each calls `setNotify({ kind, on })`.
- **`docs/deploy.md`** gets a "Stats" note:
  - Run `bun run convex run stats:backfill --deployment manzilo:wirdak:<env>` once after the first deploy of 3c. It's safe to run again.
  - The crons:
    - rollup at 00:10 Dubai
    - summary hourly, at `summaryHour`
    - milestones every 10 minutes

- [ ] **Step 1: Write the failing test.** The card shows three switches when on, and each calls `setNotify` with its kind.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify the whole suite and both builds.** Run `bun run test && bun run typecheck && bun run lint`, then build each app with `VITE_CONVEX_URL` set. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: let admins choose summary and milestone alerts`.
- [ ] **Step 6: Linear.** In project Wirdak, assigned to `me`, create "[You] Backfill stats on staging and production after plan 3c deploys", with the command above and a check that the dashboard's chart shows history. It's for Ali or Claude to run.

### Task 10: Check on staging

- [ ] **Step 1:** After merge and the staging deploy, run the backfill on staging. Open `stg-admin.wirdak.app` and check the six tiles and the chart for each period and metric.
- [ ] **Step 2:** Find your own khatma and your own number. Check that the pages show counts only, and no reading data.
- [ ] **Step 3:** Block a test number, try a WhatsApp sign-in from it, and expect "no code found". Unblock it.
- [ ] **Step 4:** Set `summaryHour` to the current Dubai hour, and confirm the summary push arrives within the hour. Set it back.
- [ ] **Step 5:** Confirm every operation above is in the audit log, with its note.
