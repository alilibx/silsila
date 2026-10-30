# Rotating khatma, plan 3: saved list, archive and delete, admin setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organizers keep a saved list of participants, bring in their pool khatma's members, and archive, restart or delete a khatma. Admins turn rotating khatmas on from an organizers list, set a khatma up on someone's behalf, and help run any rotating khatma.

**Architecture:** Archive state goes behind one helper, so pool and rota share it. Deleting removes the khatma and its members in one mutation, then a scheduled job purges its rows in batches, keeping finished pool `assignments` so people's own counts survive. Rota organizer logic moves out of `convex/rota.ts` mutations into plain functions in `convex/lib/rotaOps.ts`, which the session mutations and new admin mutations both call. The web rota screens read their backend from a React context, so the admin panel reuses the same screens with admin functions.

**Tech Stack:** Convex (convex-test + vitest), React 19 + Tailwind 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-wirdak-rotating-khatma-design.md` sections 8, 9, 10, 10.1, 10.2. Plans 1 and 2 are merged.

## Global Constraints

- Pool behavior is unchanged except archive and delete. Rota members' opt-in rules from plan 2 still hold: nobody gets messages without their own join message, and a new khatma always needs a new join.
- Strings live in `apps/web/src/i18n/ar.ts` or `apps/admin/src/i18n/ar.ts`. Plain Arabic, big targets.
- `bun run typecheck && bun run lint && bun run test` green after every task. No new dependencies. Conventional Commits with `Refs: ARQ-287`, **no AI attribution of any kind**.
- Every admin change writes an audit row in the same mutation (`writeAudit`).
- Organizers never see the phone numbers of people they imported from a pool khatma.
- Secrets and invite codes are drawn in actions, not mutations (`convex/lib/crypto.ts`).

## Review Focus

1. **An archived pool khatma mid-hold.** Grace timers, nudges, round completion and takes must do nothing on it, and scheduled functions already queued must not throw. Test (Task 1).
2. **Deleting while scheduled work is pending.** `tick`, `deliver`, `completeIfReady`, grace functions and note delivery all meet a missing khatma. Each returns quietly. Test (Task 1).
3. **A member's counts after a delete.** `myStats.juzRead` and the streak are unchanged after deleting a khatma they read in. Test (Task 1).
4. **Hidden numbers.** A pool member imported into a rota never exposes their phone through `people`, `today`, the saved list or the resend link. Test (Task 2).
5. **A pending organizer.** On a khatma an admin set up, nobody can act as organizer until the join message comes from exactly that number. A stranger with the link can't take it over. Test (Task 6).

---

### Task 1: Archive and delete (backend)

**Files:** Create `convex/khatmaLifecycle.ts`. Modify `convex/schema.ts`, `convex/lib/khatma.ts`, `convex/khatmas.ts`, `convex/pool.ts`, `convex/rounds.ts`, `convex/grace.ts`, `convex/nudges.ts`, `convex/organizer.ts`, `convex/rotaDays.ts`, `convex/rota.ts`. Test: `convex/khatmaLifecycle.test.ts`, plus touched test files.

**Produces:**
- `khatmas.archivedAt: v.optional(v.union(v.number(), v.null()))` for pool khatmas. A rota khatma keeps `rota.archivedAt`.
- `isArchived(khatma: Doc<"khatmas">): boolean` in `convex/lib/khatma.ts`, reading both.
- `khatmaLifecycle.archive` (sessionMutation, organizer, `{ inviteCode }`) → `{ ok: true }`. Idempotent, sets the right field, stamps `now`. Pool: clears the khatma's uncleared notes (`clearedAt`). Rota: skips unsent outbox rows of the khatma.
- `archiveKhatma(ctx, khatma)` exported for Task 6.
- `khatmaLifecycle.remove` (sessionMutation, organizer, `{ inviteCode }`) → `{ ok: true } | { error: "not_archived" }`. Calls exported `deleteKhatma(ctx, khatma)`: deletes the `members` rows and the khatma, then schedules `khatmaLifecycle.purgeRows({ khatmaId, stage })`.
- `purgeRows` (internalMutation, 200 rows per run, reschedules itself): `rounds`; unfinished `assignments`; `notes`; `rotaParticipants`; `rotaSlots`; `rotaDays`; `rotaReads`; `rotaOutbox`; `rotaJoinRequests`. `helpRequests.khatmaId` set to null. **Finished `assignments` stay**, so `myStats` and pace keep working [plan's call]. Check every reader of `assignments`: none may assume its khatma exists.
- `isArchived` stops work:
  - `pool.ts` actions throw `ConvexError({ code: "archived" })` (add to `apps/web` error maps in Task 3)
  - `rounds.completeIfReady` no-ops
  - grace functions no-op
  - `nudges` sweep and check skip
  - `autoHandoverSweep` skips
  - `notify` stays as is, since those callers stopped
- `khatmas.view` adds `archived: boolean` to the pool result and to `{ rota: true, name, joinLink, archived }`. `khatmas.mine` cards add `archived: boolean`.

- [ ] **Step 1:** Failing tests:
  - archive sets the field for pool and rota, non-organizer refused
  - pool `take` on an archived khatma throws `archived`
  - **Review Focus 1:** a hold mid-grace on an archived khatma: the grace end function does nothing; `completeIfReady` does nothing; a nudge sweep schedules nothing
  - `remove` refuses a live khatma; on an archived one, the khatma and members are gone at once and the rows after `finishAllScheduledFunctions`
  - **Review Focus 3:** `myStats` unchanged after delete
  - **Review Focus 2:** a `tick`, `deliver`, grace end and `completeIfReady` for a deleted khatma return without throwing
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(convex): archive and delete a khatma`.

### Task 2: Saved list, pool import, start again (backend)

**Files:** Modify `convex/schema.ts`, `convex/rota.ts`, `convex/lib/text.ts` if needed. Test: `convex/rota.saved.test.ts`.

**Produces:**
- Table `rotaContacts`: `{ ownerPersonId, name, phone: string | null, personId: Id<"people"> | null, createdAt }`, indexes `by_owner` `["ownerPersonId"]`, `by_owner_phone` `["ownerPersonId", "phone"]`, `by_owner_person` `["ownerPersonId", "personId"]`.
- `rotaParticipants.phoneHidden: v.optional(v.boolean())`: true for people imported from a pool khatma. Everything that returns `phone` to a client returns null for these. The web shows no resend link for them.
- Adding a participant by typing upserts a contact (same phone → keeps one row, name updated). This includes `acceptJoinRequest`. The organizer's own row isn't saved.
- `rota.saved` (sessionQuery, organizer of `inviteCode`) → `{ id, name, phone: string | null, inKhatma: boolean }[]` sorted by name (Arabic collation via `localeCompare("ar")`).
- `rota.addSaved({ inviteCode, contactId, juz? })` → same result union as `addParticipant`, using `placeNewParticipant`. A hidden contact keeps `phoneHidden`.
- `rota.removeSaved({ contactId })` (session, owner only) → `{ ok: true } | { error: "not_found" }`.
- `people.savedPeople` (sessionQuery) → the signed-in person's contacts, for the settings section.
- `rota.importable` (sessionQuery `{ inviteCode }`) → `{ inviteCode, title, memberCount }[]`: pool khatmas (not archived) the organizer runs with at least one active member besides them.
- `rota.importMembers({ inviteCode, sourceInviteCode })` → `{ ok: true; added: number; skipped: number } | { error: "not_found" }`. Adds the source's active members in `joinedAt` order to free ajza', skipping the organizer and people already in, stopping when ajza' run out. Sets `phoneHidden: true`, `personId`, and a linked contact.
- `rota.startAgain` (action `{ sessionToken?, inviteCode, firstDate }`) → `{ inviteCode }`, via an internal mutation with invite and join code retries like `create`. Source must be archived and rota. Applies the cap, the rate limit, and the `create` date checks; `rotaAllowed` isn't re-checked (they already run one) [plan's call]. Copies name, days, messages, time zone and active participants on the same slots, with `joinedAt`, `stoppedAt`, `silencedAt`, `silentDays`, `lastReplyAt` empty, keeping `phoneHidden`. New `setupDoneAt: null`, `endDate: null`.

- [ ] **Step 1:** Failing tests: typing saves a contact once; `saved` lists it with `inKhatma`; `addSaved` places them; `removeSaved` by another person refused; **Review Focus 4:** an imported member's phone is absent from `people`, `today` and `saved` output (assert the digits don't appear in the JSON); import stops at 30 and reports skipped; `startAgain` copies slots, leaves everyone unjoined, refuses a live source, and respects the cap.
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(convex): saved participants, pool import and starting a rota again`.

### Task 3: Web: archive, delete, start again

**Files:** Modify `apps/web/src/pages/HomePage.tsx`, `KhatmaPage.tsx`, `OrganizerPage.tsx`, `RotaSettingsPage.tsx`, `RotaKhatmaPage.tsx`, `apps/web/src/components/SwitchKhatmaSheet.tsx`, `BottomBar.tsx` if it counts khatmas, `apps/web/src/i18n/ar.ts`. Create `apps/web/src/features/khatma/ArchivedActions.tsx`. Test: the matching page tests.

**Produces:**
- Home: active khatmas as today; below them a collapsed «المؤرشفة» section listing archived ones. The switch sheet leaves archived ones out.
- Settings (pool and rota): «أرشف الختمة» with a confirm sheet that says messages stop and nothing is lost.
- An archived khatma's page shows a banner «هذه الختمة مؤرشفة» and read-only content. Rota: Today and People read-only, «ابدأ من جديد بالأشخاص أنفسهم» opens a sheet with `DateLine` for the new date of khatma 1, calls `rota.startAgain`, and goes to `/j/:code/setup`. Both: «احذف الختمة» (ghost, red) with a confirm sheet saying it can't be undone and that saved participants stay, then to home.
- Pool actions on an archived khatma map `archived` to a message.

- [ ] **Step 1:** Failing tests for each of the above.
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(web): archive, restart and delete a khatma`.

### Task 4: Web: saved list and pool import

**Files:** Modify `apps/web/src/features/rota/RotaPeopleSetup.tsx`, `PeoplePanel.tsx`, `AddPersonForm.tsx`, `JoinStatus.tsx`, `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/i18n/ar.ts`. Create `apps/web/src/features/rota/SavedPicker.tsx`. Test: the matching tests.

**Produces (spec 6.1, 10.2):**
- Setup: above the fields, when they apply, «أضف أعضاء <khatma>» with «٢٧ عضواً، بالأسماء فقط» (`importable`, `importMembers`, reporting added and skipped), and «من ختمات سابقة» opening `SavedPicker` (`saved`, `addSaved`).
- People: the empty-row sheet also offers `SavedPicker` for that juz'.
- Hidden numbers: rows of `phoneHidden` people show no resend link.
- Settings page: a «مشاركوني» section (only when the list isn't empty): name, number or «مخفي», «احذف» with confirm.

- [ ] **Step 1:** Failing tests for each.
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(web): saved participants and bringing in pool members`.

### Task 5: Shared rota operations and a swappable web backend

**Files:** Create `convex/lib/rotaOps.ts`, `apps/web/src/features/rota/backend.tsx`. Modify `convex/rota.ts`, every `apps/web/src/features/rota/*` and `apps/web/src/pages/Rota*.tsx` that calls `useQuery`/`useMutation` on `api.rota`. Test: existing tests stay green unchanged, apart from the provider wrapper.

**Produces (no behavior change):**
- `convex/lib/rotaOps.ts`: the bodies of `people`, `today`, `settings`, `addParticipant`, `giveJuz`, `moveJuz`, `freeJuz`, `removeParticipant`, `finishSetup`, `reassign`, `markDone`, `markNotDone`, `update`, `setPaused`, `addPauseDate`, `removePauseDate`, `acceptJoinRequest`, `declineJoinRequest`, `saved`, `addSaved` as functions taking `(ctx, khatma, rota, args)` plus, where they need "me", an `actor: { personId: Id<"people"> | null }`. `convex/rota.ts` mutations become thin wrappers: auth, then the op.
- `backend.tsx`: `RotaBackendProvider`, `useRotaBackend()` returning `{ today, people, settings, … }` function references and `authArgs`. The default (no provider) uses `api.rota.*` and the session token. The screens stop importing `api.rota` directly.

- [ ] **Step 1:** Refactor; `bun run test` stays green with no assertion changes.
- [ ] **Step 2:** Run the full checks.
- [ ] **Step 3:** Commit `refactor(rota): share organizer operations and let screens choose their backend`.

### Task 6: Admin setup on behalf, and helping any rota

**Files:** Create `convex/adminRota.ts`, `apps/admin/src/pages/RotaCreatePage.tsx`, `apps/admin/src/pages/RotaHelpPage.tsx`. Modify `convex/lib/rota.ts` (config), `convex/rotaInbound.ts` (join), `convex/lib/audit.ts`, `apps/admin/src/App.tsx`, `apps/admin/src/pages/KhatmaAdminPage.tsx`, `apps/admin/src/i18n/ar.ts`. Test: `convex/adminRota.test.ts`, `apps/admin/src/pages/Rota*.test.tsx`, `convex/rotaInbound.test.ts`.

**Produces (spec 10.1):**
- Rota config gains `pendingOrganizer: v.optional(v.boolean())`.
- `adminRota.create` (action with `adminToken`, then internal mutation) `{ organizerName, organizerPhone, name, days, firstDate, endDate }` → `{ khatmaId, inviteCode }`. Finds the `people` row by phone, or creates one (`verifiedAt: 0`, `timeZone` `Asia/Dubai`, `lastSeenAt: 0`) [plan's call: a later sign-in with that number takes the existing-account path, with its PIN]. Applies the cap, not the switch. No `members` row yet, `pendingOrganizer: true`, the organizer as participant 1 on slot 1. Audited.
- `rotaInbound.join`: when `pendingOrganizer` and the sender's phone equals the organizer person's phone, insert the active `members` row, clear the flag, and notify `nowOrganizer`, on top of the usual join. **Review Focus 5:** any other phone gets the normal listed or stranger path.
- `organizerOf` already needs an active member, so a pending khatma has no web organizer. The visitor page stays as it is.
- `adminRota.*`: an `adminQuery`/`adminMutation` for each op in `rotaOps`, by `khatmaId`, each mutation with `writeAudit` (action `rota.adminChange`, `note` naming the op, target kind `khatma`), plus `archive` and `remove`. They refuse a pool khatma (`not_found`).
- Admin khatma page: for a rota khatma, a «ساعد في هذه الختمة» link to `/khatmas/:khatmaId/rota`, the join link to copy, and «بانتظار المنظّم» while pending. Rota pool view stays counts only.
- `RotaHelpPage`: a strip «تساعد بصفتك مشرفاً. كل تغيير يُسجَّل.» and the web `TodayPanel`, `PeoplePanel` and settings content inside `RotaBackendProvider` with `api.adminRota.*`.
- `RotaCreatePage` (admin): the organizer's name and number, then the web create and people screens through the same provider. Route `/rota/new`, linked from the organizers page (Task 7) and home.
- Organizer messages while pending: notes wait in-app for the organizer. The admin sees the day on the help page [plan's call: spec 10.1 says they go to the admin; no admin push is sent].

- [ ] **Step 1:** Failing tests: create finds or creates the person and audits; cap applies; **Review Focus 5:** a stranger's join on a pending khatma doesn't make them organizer, the organizer's number does, and only then does `rota.people` answer for them; an admin mutation changes state and writes one audit row; a non-admin is refused; a pool khatma is refused; admin pages render the panels with the provider.
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(admin): set up a rotating khatma on someone's behalf and help run any`.

### Task 7: Organizers list, the "you can now" note, stats

**Files:** Modify `convex/adminLookup.ts`, `convex/adminOps.ts`, `convex/lib/noteText.ts`, `convex/schema.ts`, `convex/lib/whatsappTemplates.ts`, `convex/stats.ts`, `apps/admin/src/App.tsx`, `apps/admin/src/components/Layout.tsx`, `apps/admin/src/pages/HomePage.tsx`, `apps/admin/src/i18n/ar.ts`. Create `apps/admin/src/pages/OrganizersPage.tsx`. Test: the matching tests.

**Produces (spec 10, 10.2):**
- `adminLookup.organizers` (paginated adminQuery, page of 50 khatmas newest first, grouped by creator) → `{ page: { personId, displayName, phoneMasked, rotaAllowed, khatmas: { khatmaId, name, memberCount }[] }[], continueCursor, isDone }`.
- `OrganizersPage` at `/organizers`: search box (reuses `findPerson`), a list with a switch on each row calling `setRotaAllowed` with a confirm sheet, and the link «أنشئ ختمة بالتناوب نيابةً عن منظّم». Nav entry «المنظّمون».
- Note kind `rotaEnabled`: «جديد لك: يمكنك الآن إنشاء ختمة بالتناوب: لكل شخص جزء ثابت يتقدّم مع كل ختمة، ويصله على واتساب.» `NOTE_TEMPLATES` null (in-app and push only). `setRotaAllowed` turning on notifies the person on their newest organized khatma; a person with none gets no note (notes need a khatma) [plan's call].
- `dailyStats.rotaDaysCompleted` (optional), counted in `dayCounts` from `rotaDays` by `completedAt` (add an index), and an admin home tile «أيام ختمات مكتملة».

- [ ] **Step 1:** Failing tests for each.
- [ ] **Step 2:** Run, see them fail, implement, run the full checks.
- [ ] **Step 3:** Commit `feat(admin): list organizers and tell them when rotating khatmas are on`.

### Task 8: End-to-end

**Files:** Create `e2e/rota-lifecycle.spec.ts`.

- [ ] **Step 1:** Write it: the organizer creates a rota, adds a person (saved), archives it from settings, sees the archived banner and the «المؤرشفة» home section, starts again and sees the person in setup, then archives and deletes the new one and sees it gone, with the saved person still listed in Settings.
- [ ] **Step 2:** Run `bun run e2e e2e/rota-lifecycle.spec.ts e2e/rota.spec.ts e2e/rota-whatsapp.spec.ts --project=desktop-chrome` → PASS, then the full checks.
- [ ] **Step 3:** Commit `test(e2e): archive, restart and delete a rotating khatma`.
