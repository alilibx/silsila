# Wirdak plan 3b: help requests, the help inbox, and admin push, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone ask for help from any screen of the website, with text, a voice note, and an automatic screenshot. Let admins read, answer, and close those requests in the admin app, and push each new request to the admins' phones.

**Architecture:**
- **Data.** A request is a `helpRequests` row with `helpMessages` under it. Screenshots and voice notes live in Convex file storage. Help is the only user of file storage, so any file that no message references is an orphan.
- **Signed-in members** go through `sessionMutation`s.
- **Signed-out visitors** are tied to a random reporter token kept in the browser. They create requests and get upload URLs through two HTTP routes, so a per-IP limit can read the IP. Follow-ups use a mutation keyed by the reporter token.
- **Pushes.**
  - A team reply pushes to the member like a note, inside the waking hours.
  - A new request or message pushes to every admin through the admin app's own service worker.
  - `pushNode.ts` gets one shared sender that all three use.

**Tech Stack:** Convex (file storage, `convex-test`), React 19, Vite 8, Tailwind 4, Vitest 5, `web-push`, `modern-screenshot`, and the `MediaRecorder` browser API.

**Spec:** `docs/superpowers/specs/2026-10-28-wirdak-plan3-design.md`. Read sections 3, 5 and 7, and items 1 to 6, 10 and 12 of section 13. Plan 3a (`docs/superpowers/plans/2026-10-28-wirdak-plan3a-admin-foundation.md`) built what this plan stands on. The pieces this plan uses are:
- `adminQuery` / `adminMutation`, from `convex/lib/adminSession.ts`
- `writeAudit(ctx, { actor, … })`, from `convex/lib/audit.ts`
- `SETTING_SPECS` and `validateSetting`
- the admin app shell and its `t` copy

## Global Constraints

- Arabic copy, right to left, in the website's look. Every string lives in that app's `i18n/ar.ts`.
- No AI attribution in commits or PRs (`CLAUDE.md`). Conventional Commits, each ending with `Refs: ARQ-270`.
- Text is limited to 1,000 characters. Voice notes are at most 2 minutes and 3 MB. Screenshots are one per request, JPEG or PNG, at most 2 MB. A screenshot alone can't be sent: a message needs text or a voice note.
- Only the context in spec 3.3 is attached: the person and khatma if known, path, app version, user agent, screen size, and time zone. No session token, no reading history, no list of other khatmas.
- Replies are signed "فريق وِردك", never with an admin's name.
- Request states are `open`, then `answered`, then `closed`. A person's message moves the request to `open`. An admin reply moves it to `answered`. An admin, or 14 days without a word from the person, moves it to `closed`. A closed request can still be read, and answering back reopens it.
- Maintenance mode never blocks help requests.
- Admin pushes never show the person's words or name. The text is only "طلب مساعدة جديد" or "رسالة جديدة في طلب مساعدة".
- Help pushes to members follow the quiet hours, through `nextAwake`.
- Retention:
  - Unattached uploads are deleted after 1 hour.
  - Attachments are deleted 30 days after the request closes.
  - The whole conversation is deleted 180 days after it closes.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass after every task.
- `convex/_generated/api.d.ts` is regenerated after adding a Convex module. Use `bunx convex codegen` if a deployment is reachable. Otherwise use the plan 3a script, which rewrites the module list of the existing file.

## Review Focus

1. **A visitor's reporter token used to read someone else's request.** `mine`, `sendAsVisitor` and `markSeen` match the token's hash to the request's `reporterHash`. A wrong or missing token sees nothing and changes nothing. Test: Task 2.
2. **A file uploaded but never sent, or a file of the wrong type or size.** It's refused with `bad_file` and deleted at once. If it's never attached, it's swept after an hour. It never stays forever. Tests: Tasks 2 and 6.
3. **A request whose person signed in on that browser later.** Their visitor requests move to their account, and the browser's reporter token is forgotten. Nothing is lost or duplicated. Tests: Tasks 2 and 8.
4. **The microphone refused, missing, or not supported** (old iOS, or desktop with no mic). The voice button hides, and text still sends. Test: Task 7.
5. **An admin removed while push is on.** Their admin push subscriptions are deleted in the same transaction, so pushes stop. Test: Task 5.

---

### Task 1: Help tables, settings, and audit actions

**Files:**
- Modify: `convex/schema.ts`, `convex/lib/audit.ts`, `convex/lib/settings.ts`, `convex/lib/settingSpecs.ts`
- Modify: `apps/admin/src/i18n/ar.ts` (labels for the new keys, group, and actions; these types are `Record`s, so they must change together)
- Test: extend `convex/lib/settings.test.ts`, `convex/lib/settingSpecs.test.ts`

**Interfaces:**
- Produces, in `convex/schema.ts`:
  - **`helpRequests`**, with these fields:
    - `personId: Id<"people"> | null`
    - `reporterHash: string | null`, the sha256 of a visitor's reporter token. Exactly one of `personId` and `reporterHash` is set.
    - `khatmaId: Id<"khatmas"> | null`
    - `status: "open" | "answered" | "closed"`
    - `context: { path: string; appVersion: string; userAgent: string; screen: string; timeZone: string }`
    - `createdAt`, `lastMessageAt`
    - `answeredAt: number | null`, `closedAt: number | null`
    - `seenAt: number | null`, the last time the person saw the conversation
    - `attachmentsDeletedAt: number | null`

    Indexes:
    - `by_person` `["personId", "lastMessageAt"]`
    - `by_reporter` `["reporterHash", "lastMessageAt"]`
    - `by_status` `["status", "lastMessageAt"]`
    - `by_status_answeredAt` `["status", "answeredAt"]`
    - `by_closedAt` `["closedAt"]`
  - **`helpMessages`**, with these fields:
    - `requestId`
    - `from: "person" | "visitor" | "team"`
    - `text: string | null`
    - `screenshotId: Id<"_storage"> | null`
    - `voiceId: Id<"_storage"> | null`, `voiceSeconds: number | null`
    - `createdAt`

    Indexes: `by_request` `["requestId", "createdAt"]`, `by_screenshot` `["screenshotId"]`, `by_voice` `["voiceId"]`.
  - **`admins`** gains `notifyHelp: v.optional(v.boolean())`. Absent means on.
  - **`adminPushSubscriptions`**: `{ adminId, endpoint, p256dh, auth, createdAt }`, with indexes `by_admin` and `by_endpoint`.
  - **`auditLog.targetKind`** gains `"help"`.
- Produces, in `convex/lib/audit.ts`: the validator gains `"help.close"` and `"help.reopen"`.
- Produces, in `SETTING_DEFAULTS` and `SETTING_SPECS` (a new `SettingGroup` `"help"`). Durations are in ms.

  | Key | Default | Kind | Min | Max |
  |---|---|---|---|---|
  | `helpRequestsPerPersonPerDay` | 5 | int | 1 | 50 |
  | `helpRequestsPerVisitorPerDay` | 3 | int | 1 | 50 |
  | `helpRequestsPerIpPerDay` | 10 | int | 1 | 500 |
  | `helpMessagesPerHour` | 20 | int | 1 | 200 |
  | `helpAutoCloseMs` | 14 days | duration | 1 day | 90 days |
  | `helpAttachmentRetentionMs` | 30 days | duration | 1 day | 365 days |
  | `helpRetentionMs` | 180 days | duration | 30 days | 730 days |

  Admin copy:
  - `t.settings.groups.help` is `"طلبات المساعدة"`.
  - Labels, in key order:
    - `"طلبات مساعدة لكل شخص / يوم"`
    - `"طلبات مساعدة لكل زائر / يوم"`
    - `"طلبات مساعدة لكل IP / يوم"`
    - `"رسائل المساعدة / ساعة"`
    - `"إغلاق تلقائي بعد الرد بلا جواب"`
    - `"الاحتفاظ بالصور والتسجيلات بعد الإغلاق"`
    - `"الاحتفاظ بالمحادثة بعد الإغلاق"`
  - `t.audit.actions["help.close"]` is `"أغلق طلب مساعدة"`, and `["help.reopen"]` is `"أعاد فتح طلب مساعدة"`.
  - `SettingsPage`'s `ORDER` adds `"help"` after `"notifications"`.

- [ ] **Step 1: Write the failing tests.** In `settings.test.ts`, add the seven defaults to "defaults match the spec". In `settingSpecs.test.ts`:
  - `validateSetting("helpAutoCloseMs", 12 * HOUR)` is `out_of_range`.
  - `validateSetting("helpRequestsPerIpPerDay", 10)` is null.
- [ ] **Step 2: Run them and see them fail.** `bun run test convex/lib/settings convex/lib/settingSpecs`. Expected: FAIL on the missing keys.
- [ ] **Step 3: Implement.** Add the tables, keys, specs, group, actions, and admin copy.
- [ ] **Step 4: Run the full suite.** `bun run test && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add help request tables, settings and audit actions`.

### Task 2: Help for members and visitors (backend)

**Files:**
- Create: `convex/lib/helpFiles.ts`, `convex/help.ts`
- Test: `convex/help.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and settings, `sessionMutation` / `sessionQuery` / `requirePerson`, `checkRateLimits`, `sha256Hex`, and `khatmaByInviteCode` from `convex/lib/khatma.ts`.
- Produces, in `convex/lib/helpFiles.ts`:
  - `SCREENSHOT_TYPES = ["image/jpeg", "image/png"]`, `SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024`
  - `VOICE_TYPES = ["audio/mp4", "audio/webm", "audio/mpeg", "audio/ogg", "audio/aac"]`, `VOICE_MAX_BYTES = 3 * 1024 * 1024`, `VOICE_MAX_SECONDS = 120`
  - `checkFile(ctx: MutationCtx, id: Id<"_storage">, kind: "screenshot" | "voice"): Promise<boolean>`
    - Reads `ctx.db.system.get(id)`. It accepts the file when its type matches the list, ignoring the part after `;` (so `audio/webm;codecs=opus` passes), and its size is within the limit.
    - It also refuses a file that a `helpMessages` row already references. This stops a file from being attached twice.
    - On refusal it deletes the file with `ctx.storage.delete` before returning false.
- Produces, in `convex/lib/help.ts`, shared by `help.ts` and the HTTP routes in Task 3:
  - `type HelpInput = { text: string | null; screenshotId: Id<"_storage"> | null; voiceId: Id<"_storage"> | null; voiceSeconds: number | null }`
  - `cleanHelpInput(ctx, input: HelpInput, allowScreenshot: boolean): Promise<HelpInput | { error: "empty" | "bad_file" | "too_long" }>`
    - Text is trimmed. An empty string becomes null. More than 1,000 characters gives `too_long`.
    - It needs text or a voice note, otherwise `empty`.
    - `voiceSeconds` must be between 1 and `VOICE_MAX_SECONDS`, rounded.
    - Follow-ups pass `allowScreenshot: false`. A screenshot sent anyway is deleted and gives `bad_file`.
  - `cleanContext(raw: unknown): HelpContext`. Each field is a string capped at 200 characters (user agent 300). A missing field becomes `""`.
  - `createRequest(ctx, args: { owner: { personId: Id<"people"> } | { reporterHash: string }; inviteCode: string | null; input: HelpInput; context: HelpContext }): Promise<Id<"helpRequests">>`
    - It inserts the request with status `open`, and its first message, `from` `"person"` or `"visitor"`.
    - It sets `khatmaId` from `inviteCode` when that khatma exists. A member must also be a member of it.
    - It calls `notifyAdmins(ctx, requestId, "request")` from Task 5. Until Task 5 lands, that's a no-op function exported from `convex/lib/help.ts`, which Task 5 replaces.
  - `addMessage(ctx, request: Doc<"helpRequests">, from: "person" | "visitor", input: HelpInput): Promise<void>`. It inserts the message, sets `status: "open"`, `lastMessageAt`, and `closedAt: null`, then `notifyAdmins(ctx, request._id, "message")`.
- Produces, in `convex/help.ts`:
  - `uploadUrl` (`sessionMutation`) → `string`. The person must be signed in. It counts against `helpMessagesPerHour` (key `helpUpload:person:<id>`).
  - `uploadUrlAsVisitor` (`mutation`, args `{ reporterToken: string, requestId: Id<"helpRequests"> }`) → `string | { error: "not_found" | "rate_limited" }`. This is for follow-up voice notes inside an existing conversation only. The request must exist and its `reporterHash` must match the token, otherwise `not_found`. Tokens cost nothing to mint, so a token alone mustn't buy upload URLs. Limits: `helpUpload:visitor:<hash>` 20 per hour, plus a global sharded `helpUpload:visitorGlobal` 300 per hour. New requests get their URL from Task 3's HTTP route, which has the per-IP limit.
  - `send` (`sessionMutation`, args `{ requestId?: Id<"helpRequests">, inviteCode?: string, text?: string, screenshotId?: Id<"_storage">, voiceId?: Id<"_storage">, voiceSeconds?: number, context: v.any() }`) → `{ requestId } | { error: "rate_limited" | "empty" | "bad_file" | "too_long" | "not_found" }`.
    - Without `requestId`, it creates a request, limited by `helpRequestsPerPersonPerDay` (key `helpCreate:person:<id>`, 24 hours) and `helpMessagesPerHour`.
    - With `requestId`, it adds a message, limited by `helpMessagesPerHour`. The request must belong to the person, otherwise `not_found`.
  - `sendAsVisitor` (`mutation`, args `{ reporterToken, requestId, text?, voiceId?, voiceSeconds? }`). Follow-ups only, with the same results. Matched by `reporterHash`.
  - `mine` (`query`, args `{ sessionToken?: string, reporterToken?: string }`) → up to 10 requests, newest first. Each has `{ _id, status, createdAt, lastMessageAt, unread: boolean, messages: Array<{ _id, from, text, hasScreenshot, voiceUrl: string | null, voiceSeconds, createdAt }> }`. `unread` means the last message is from `"team"` and newer than `seenAt`. A session wins over a reporter token. With neither, it returns `[]`.
  - `markSeen` (`mutation`, args `{ requestId, sessionToken?, reporterToken? }`) sets `seenAt` when the caller owns the request.
  - `claimVisitorRequests` (`sessionMutation`, args `{ reporterToken }`) → `{ moved: number }`. It sets `personId` and clears `reporterHash` on every request with that hash.

- [ ] **Step 1: Write the failing tests** in `convex/help.test.ts`, following the setup in `convex/sessions.test.ts`. Store files with `t.run((ctx) => ctx.storage.store(new Blob([...], { type })))`.
  - **First request.** A member's first message creates an `open` request with the context, and `from: "person"`. `mine` returns it.
  - **Bad input.**
    - Text over 1,000 characters gives `too_long`.
    - A screenshot only gives `empty`.
    - A `text/plain` file as a screenshot gives `bad_file`, and the file is gone from storage.
    - A 3 MB PNG gives `bad_file`.
    - A voice note of 121 seconds gives `bad_file`.
    - `audio/webm;codecs=opus` is accepted.
  - **Reused file.** A file already attached to one message can't be attached to another: `bad_file`.
  - **Limits.** The 6th request in a day gives `rate_limited`. The 21st message in an hour gives `rate_limited`.
  - **Khatma.** The khatma is set from an invite code the member belongs to. It's null for one they don't belong to.
  - **Visitors (Review Focus 1).** `sendAsVisitor` with the wrong token gives `not_found`. `uploadUrlAsVisitor` with a fresh token, or with a token that doesn't own the request, gives `not_found` and no URL. `mine` with the wrong token is `[]`. `markSeen` with the wrong token changes nothing.
  - **Reopening.** A follow-up on a `closed` request reopens it as `open`, with `closedAt` null.
  - **Unread.** `unread` is true after a team message (insert one directly), and false after `markSeen`.
  - **Claiming (Review Focus 3).** `claimVisitorRequests` moves two visitor requests to the person. `mine` with the session shows both, and `mine` with the old token shows none.
  - **Maintenance.** `send` works while `maintenanceMode` is on.
- [ ] **Step 2: Run them and see them fail.** `bun run test convex/help.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Regenerate `api.d.ts`.
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: let members and visitors send help requests with files`.

### Task 3: HTTP routes for signed-out visitors

**Files:**
- Modify: `convex/http.ts`
- Test: `convex/http.help.test.ts`

**Interfaces:**
- Consumes: `createRequest`, `cleanHelpInput`, `cleanContext` (Task 2), `callerIp`, `readCappedText`, and `corsHeaders` / `allowedOrigin` (the website origin only).
- Produces:
  - **`POST /api/help/upload-url`**, body `{ reporterToken }` → `{ uploadUrl }`.
    - Limits: `helpUpload:ip:<ip>` 30 per hour, and `helpUpload:visitor:<hash>` 20 per hour.
    - Calls an `internalMutation` `help.uploadUrlInternal({ reporterHash, ip })`.
  - **`POST /api/help/request`**, body `{ reporterToken, inviteCode?, text?, screenshotId?, voiceId?, voiceSeconds?, context }`, capped at 8 KB → `{ requestId }` or `{ error }`. Errors map to 400 (`empty`, `bad_file`, `too_long`, `bad_request`) and 429 (`rate_limited`).
    - Limits: `helpRequestsPerVisitorPerDay` (key `helpCreate:visitor:<hash>`) and `helpRequestsPerIpPerDay` (key `helpCreate:ip:<ip>`, when the IP is known). All the buckets go through `checkRateLimits`, all or nothing.
    - Calls `help.createAsVisitorInternal`.
  - **`OPTIONS`** for both routes, mirroring `/api/verification/start`. The reporter token must be 20 to 200 characters, otherwise `bad_request`. Only its sha256 is stored.

- [ ] **Step 1: Write the failing tests** in `http.help.test.ts`. Use the `WIRDAK_ENV: "prod"` setup from `convex/http.admin.test.ts`.
  - The admin origin and other origins get 403. The website origin gets 200.
  - A request creates a `reporterHash` row and never stores the raw token.
  - The 11th request from one IP in a day gets 429.
  - The 4th request from one token in a day gets 429.
  - A body over 8 KB gets 413.
  - A token shorter than 20 characters gets 400.
- [ ] **Step 2: Run them and see them fail.** `bun run test convex/http.help.test.ts`. Expected: FAIL (404).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: accept help requests from signed-out visitors over HTTP`.

### Task 4: Admin help backend, and reply pushes to members

**Files:**
- Create: `convex/adminHelp.ts`
- Modify: `convex/pushNode.ts` (shared sender), `convex/push.ts` (a help delivery plan)
- Test: `convex/adminHelp.test.ts`, extend `convex/push.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2, plan 3a's `adminQuery` / `adminMutation` / `writeAudit`, and `nextAwake` / `quietHours`.
- Produces, in `convex/adminHelp.ts`:
  - `counts` (`adminQuery`) → `{ open: number; oldestOpenAt: number | null }`. It reads `by_status` for `open` and takes at most 100 rows. The count shows "99+" above 99.
  - `list` (`adminQuery`, args `{ status: "open" | "answered" | "closed", paginationOpts }`). Open requests are listed oldest first, the others newest first. Each row has `{ _id, status, createdAt, lastMessageAt, firstLine: string, hasVoice, hasScreenshot, who: string, khatmaName: string | null }`. `who` is the display name, or `"زائر"` for a visitor (the copy goes in the admin i18n, and the server returns `null` for a visitor).
  - `get` (`adminQuery`, args `{ requestId }`) → the request with:
    - `context`
    - `person: { personId, displayName, phone } | null`
    - `khatma: { name, inviteCode } | null`
    - `messages`, each with `screenshotUrl` and `voiceUrl` from `ctx.storage.getUrl`, or null once attachments are deleted
  - `reply` (`adminMutation`, args `{ requestId, text }`) → `{ ok: true } | { error: "empty" | "too_long" | "not_found" }`.
    - It inserts `from: "team"`, and sets `status: "answered"`, `answeredAt`, and `lastMessageAt`.
    - It schedules a push to the member with `scheduleHelpReplyPush`.
    - No audit row: spec 4.5 says replies aren't audit rows.
  - `close` and `reopen` (`adminMutation`, args `{ requestId }`). Each writes `help.close` or `help.reopen`, with `targetKind: "help"` and the status before and after.
- Produces, in `convex/push.ts`:
  - `helpReplyPlan` (`internalQuery`, args `{ messageId }`) → `{ subscriptions, payload } | null`. It returns null when:
    - the message is gone or isn't a team message,
    - the request has no `personId`,
    - the person has no subscriptions, or
    - the person has no membership with `notificationsOn`.

    The payload is `{ title: "وِردك", body: "رد من فريق وِردك على طلب المساعدة", url: "/?help=<requestId>", tag: "help-<requestId>" }`.
  - `scheduleHelpReplyPush(ctx, messageId)`. It schedules `pushNode.deliverHelpReply` at `nextAwake(now, person.timeZone, quietHours)`. It does nothing for visitors.
- Produces, in `convex/pushNode.ts`:
  - `sendToSubscriptions(ctx: ActionCtx, subscriptions: Array<{ endpoint, p256dh, auth }>, payload: unknown, onGone: (endpoints: string[]) => Promise<void>): Promise<void>`. It holds the VAPID check, `sendNotification`, and the 404 and 410 handling that `deliver` has today. `deliver` is rewritten to use it, with no change in behavior.
  - `deliverHelpReply` (`internalAction`, args `{ messageId }`).

- [ ] **Step 1: Write the failing tests:**
  - **Lists.** `list` returns open requests oldest first. `who` is null for a visitor.
  - **Counts.** `counts` gives the open count and the oldest open time.
  - **Reply.** A reply makes the request `answered`, inserts a `team` message, and schedules `deliverHelpReply` (check `_scheduled_functions`).
  - **Close and reopen.** `close` and `reopen` each write their audit row. A reply writes none.
  - **Get.** `get` returns storage URLs, and null after `attachmentsDeletedAt`.
  - **Not admins.** A member token on any `adminHelp` function throws `not_admin`.
  - **Reply push plan.** In `push.test.ts`:
    - `helpReplyPlan` is null for a person whose memberships all have notifications off.
    - It has the payload above for a person with one membership that has them on.
  - **Shared sender.** The existing `push.test.ts` tests for `deliver` still pass unchanged.
- [ ] **Step 2: Run them and see them fail.** `bun run test convex/adminHelp.test.ts convex/push.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: let admins read, answer and close help requests`.

### Task 5: Admin push backend

**Files:**
- Create: `convex/adminPush.ts`
- Modify: `convex/lib/help.ts` (the real `notifyAdmins`), `convex/admins.ts` (`remove` drops subscriptions), `convex/pushNode.ts` (`deliverToAdmins`)
- Test: `convex/adminPush.test.ts`, extend `convex/admins.test.ts`

**Interfaces:**
- Produces, in `convex/adminPush.ts`:
  - `subscribe` (`adminMutation`, args `{ endpoint, p256dh, auth }`). It upserts by endpoint. An endpoint held by another admin moves to the caller.
  - `unsubscribe` (`adminMutation`, args `{ endpoint }`).
  - `mine` (`adminQuery`, args `{ endpoint?: string }`) → `{ thisDevice: boolean; notifyHelp: boolean }`.
  - `setNotifyHelp` (`adminMutation`, args `{ on: boolean }`). No audit row: it's a personal preference, not a change to Wirdak.
  - `deliveryPlan` (`internalQuery`, args `{ requestId, kind: "request" | "message" }`) → the subscriptions of every admin whose `notifyHelp !== false`, plus the payload. The payload is `{ title: "وِردك · الإدارة", body: kind === "request" ? "طلب مساعدة جديد" : "رسالة جديدة في طلب مساعدة", url: "/help/<requestId>", tag: "help-<requestId>" }`.
- In `convex/lib/help.ts`: `notifyAdmins(ctx, requestId, kind)` schedules `pushNode.deliverToAdmins` with `runAfter(0)`. Admin pushes ignore quiet hours (spec 7).
- In `convex/pushNode.ts`: `deliverToAdmins` (`internalAction`) uses `sendToSubscriptions`, with `onGone` removing gone admin endpoints through `adminPush.removeGone`.
- In `convex/admins.ts`: `remove` deletes the removed admin's `adminPushSubscriptions` in the same mutation. This resolves deferred item 9 of ARQ-270.

- [ ] **Step 1: Write the failing tests:**
  - **Subscribing.** `subscribe` then `mine` gives `thisDevice: true`. An endpoint subscribed by admin A and then by admin B belongs only to B.
  - **Plan.** `deliveryPlan` leaves out admins with `notifyHelp: false`, and its body never contains the request's text (check with a text containing "سرّي").
  - **Scheduling.** Creating a request (Task 2's `send`) schedules `deliverToAdmins`.
  - **Removal (Review Focus 5).** In `admins.test.ts`, `remove` deletes the removed admin's push subscriptions.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Regenerate `api.d.ts`.
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: push new help requests to admins`.

### Task 6: Auto-close, retention, and orphaned uploads

**Files:**
- Modify: `convex/help.ts` (`autoClose`), `convex/maintenance.ts` (`purge`), `convex/crons.ts`
- Test: extend `convex/help.test.ts`, `convex/maintenance.test.ts`

**Interfaces:**
- `help.autoClose` (`internalMutation`), run hourly from `crons.ts`. It closes `answered` requests with `answeredAt < now - helpAutoCloseMs`, through the `by_status_answeredAt` index, in batches of 500, and reschedules itself while more are left. It writes no audit row, because the system did it.
- `maintenance.purge` gains three sweeps, each batched like the others:
  1. **Attachments.** Requests with `closedAt < now - helpAttachmentRetentionMs` and `attachmentsDeletedAt === null` get their messages' files deleted (`ctx.storage.delete`), both ids set to null, and `attachmentsDeletedAt = now`.
  2. **Conversations.** Requests with `closedAt < now - helpRetentionMs` are deleted with all their messages and any files still left.
  3. **Orphaned uploads.** `ctx.db.system.query("_storage")` files older than 1 hour that no `helpMessages` row references (check `by_screenshot` and `by_voice`) are deleted. To avoid rescanning, the sweep keeps its high-water mark (the newest `_creationTime` it checked) in a `settings`-style row. Keep it in a small table `sweepMarks { name, value }`, not in `settings`, because admins can edit settings. Add that table in this task.

- [ ] **Step 1: Write the failing tests:**
  - **Auto-close.** An `answered` request auto-closes at 14 days and 1 minute, but not at 13 days.
  - **Attachments.** Attachments go 30 days and 1 minute after closing, while the text stays and the URLs become null in `get`.
  - **Conversations.** A conversation goes 180 days and 1 minute after closing, with its messages.
  - **Orphans (Review Focus 2).** A stored file attached to nothing is deleted after 1 hour and 1 minute and kept at 59 minutes. An attached file is never deleted by this sweep.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test convex && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: auto-close answered help requests and purge old files`.

### Task 7: Screenshot capture and voice recording (website)

**Files:**
- Create: `apps/web/src/features/help/captureScreen.ts`, `apps/web/src/features/help/useVoiceRecorder.ts`
- Modify: `apps/web/package.json` (add `modern-screenshot`)
- Test: `apps/web/src/features/help/captureScreen.test.ts`, `apps/web/src/features/help/useVoiceRecorder.test.tsx`

**Interfaces:**
- `captureScreen(): Promise<Blob | null>`
  - It renders `document.body` with `modern-screenshot`'s `domToBlob`, type `image/jpeg`, quality 0.7, and scale `min(1, 1280 / window.innerWidth)`.
  - If the result is over 2 MB, it retries at quality 0.5, then at half scale.
  - It returns null on any error, or if the result is still too big.
  - It's called before the sheet opens.
- `useVoiceRecorder(): { supported: boolean; state: "idle" | "recording" | "done" | "denied"; seconds: number; blob: Blob | null; start(): Promise<void>; stop(): void; discard(): void }`
  - `supported` is false when `MediaRecorder` or `navigator.mediaDevices?.getUserMedia` is missing.
  - The first supported type among `audio/mp4`, `audio/webm;codecs=opus`, `audio/webm` is used (`MediaRecorder.isTypeSupported`).
  - Recording stops by itself at 120 seconds.
  - A refused permission sets `denied`.
  - The stream's tracks are stopped when recording ends or the component unmounts.

- [ ] **Step 1: Write the failing tests.** Mock `modern-screenshot` and a fake `MediaRecorder`:
  - `captureScreen` returns the first blob under 2 MB, retries when the first is too big, and returns null when the library throws.
  - The recorder reports `supported: false` without `MediaRecorder`.
  - It sets `denied` when `getUserMedia` rejects (Review Focus 4).
  - It stops at 120 seconds with fake timers.
  - It stops the tracks on unmount.
- [ ] **Step 2: Run them and see them fail.** `bun run test apps/web/src/features/help`. Expected: FAIL.
- [ ] **Step 3: Implement.** Run `bun add --cwd apps/web modern-screenshot`, or edit `package.json` and run `bun install`.
- [ ] **Step 4: Run the tests.** `bun run test apps/web && bun run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: capture the screen and record voice notes for help requests`.

### Task 8: The help button, the help sheet, and replies (website)

**Files:**
- Create: `apps/web/src/features/help/HelpButton.tsx`, `HelpSheet.tsx`, `HelpConversation.tsx`, `HelpReplyCard.tsx`, `reporterToken.ts`, `useClaimVisitorHelp.ts`, `useHelpDeepLink.ts`, `helpButtonVisibility.tsx`, `sendHelp.ts`
- Modify: `apps/web/src/pages/CelebrationPage.tsx` (calls `useHideHelpButton()`)
- Modify: `apps/web/src/App.tsx` (mount `HelpButton` beside `StatusBanners`, and call `useClaimVisitorHelp()`), `apps/web/src/pages/HomePage.tsx` (render `HelpReplyCard` at the top), `apps/web/src/i18n/ar.ts` (`t.help`), `apps/web/src/styles.css`
- Test: `HelpSheet.test.tsx`, `HelpReplyCard.test.tsx`, `useClaimVisitorHelp.test.tsx`, `reporterToken.test.ts`

**Interfaces:**
- `reporterToken.ts`: `getReporterToken(): string | null`, `ensureReporterToken(): string` (32 random bytes, hex, kept in `wirdak.help.reporter` through `readStored` / `writeStored`), and `forgetReporterToken()`.
- `sendHelp.ts`: `sendHelp(args: { sessionToken: string | null; requestId?: string; text: string; screenshot: Blob | null; voice: { blob: Blob; seconds: number } | null; inviteCode: string | null; context: HelpContext }): Promise<{ requestId: string } | { error: string }>`
  - It uploads each blob with a `POST` to an upload URL. Signed-in members get the URL from `help.uploadUrl`. Visitors get it from `/api/help/upload-url` for a new request, or from `help.uploadUrlAsVisitor` for a follow-up.
  - It then calls `help.send`, `/api/help/request`, or `help.sendAsVisitor`.
  - `context` is built by `helpContext()` from `location.pathname`, `__APP_VERSION__`, `navigator.userAgent`, `${innerWidth}x${innerHeight}`, and `Intl.DateTimeFormat().resolvedOptions().timeZone`. The invite code is read from `/j/:code` paths.
- `HelpButton`
  - A 44 px round "؟" button with `aria-label={t.help.open}`. It's `fixed` at the top end of the screen (left in RTL), at `top: max(12px, env(safe-area-inset-top))`, on every screen except the full-screen celebration. The website has no celebration route: `CelebrationPage` renders inside `KhatmaPage`. So `CelebrationPage` sets a flag through a small `HelpButtonVisibility` context (`useHideHelpButton()` in an effect) that `HelpButton` reads.
  - In `styles.css`, `main > header { padding-inline-end: 3.5rem }` keeps page headers clear of it.
  - On tap it awaits `captureScreen()`, then opens `HelpSheet` with the blob.
- `HelpSheet` (`Sheet` titled `t.help.title`):
  - **Your requests.** The person's open and recent requests from `help.mine`. Tapping one opens `HelpConversation`.
  - **Composer.** A textarea (`maxLength` 1000) and a screenshot thumbnail with a × button and tap-to-enlarge. The voice control is record, then stop, then play back or delete. It's hidden when `!supported` or `denied`.
  - **Send.** Enabled only with text or a voice note. Then it shows the sent screen: `t.help.sentTitle`, `t.help.sentBody`, and a "تم" button.
  - **Errors** show `t.help.errors[code]` with `role="alert"`.
- `HelpConversation`: messages in order, labeled `t.help.you` or `t.help.team` ("فريق وِردك"), with audio players for voice notes. A reply composer offers text and voice, without a screenshot. Opening it calls `help.markSeen`.
- `HelpReplyCard`: on the home page, when any request in `mine` is `unread`, it shows `t.help.replyCardTitle` ("رد من فريق وِردك"), the start of the reply, and a button that opens the sheet on that conversation.
- `useHelpDeepLink()`, mounted in `App` beside `HelpButton`, not in `HomePage`. `HomePage` may redirect to a pending take or create (`pendingResumePath`) before it would see the query. It reads `?help=<id>` once on load, opens the sheet on that conversation, and removes the query with `history.replaceState`.
- `useClaimVisitorHelp()`: when a session token and a reporter token both exist, it calls `help.claimVisitorRequests` once, then `forgetReporterToken()`.
- Copy, verbatim:

  | Key | Text |
  |---|---|
  | `t.help.open` | `"محتاج مساعدة؟"` |
  | `t.help.title` | `"محتاج مساعدة؟"` |
  | `t.help.intro` | `"اكتب أو سجّل رسالة، وسنرد عليك هنا."` |
  | `t.help.placeholder` | `"اكتب ما حدث…"` |
  | `t.help.screenshot` | `"صورة الشاشة"` |
  | `t.help.removeScreenshot` | `"إزالة الصورة"` |
  | `t.help.record` | `"اضغط للتسجيل"` |
  | `t.help.stop` | `"إيقاف"` |
  | `t.help.deleteVoice` | `"حذف التسجيل"` |
  | `t.help.send` | `"أرسل"` |
  | `t.help.sentTitle` | `"وصلتنا رسالتك"` |
  | `t.help.sentBody` | `"سنرد عليك هنا في وِردك، وسيصلك تنبيه."` |
  | `t.help.done` | `"تم"` |
  | `t.help.yourRequests` | `"طلباتك"` |
  | `t.help.you` | `"أنت"` |
  | `t.help.team` | `"فريق وِردك"` |
  | `t.help.replyCardTitle` | `"رد من فريق وِردك"` |
  | `t.help.openReply` | `"اقرأ الرد"` |
  | `t.help.status.open` | `"بانتظار الرد"` |
  | `t.help.status.answered` | `"تم الرد"` |
  | `t.help.status.closed` | `"مغلق"` |
  | `t.help.errors.rate_limited` | `"أرسلت رسائل كثيرة. حاول بعد قليل."` |
  | `t.help.errors.empty` | `"اكتب رسالة أو سجّل صوتك."` |
  | `t.help.errors.too_long` | `"الرسالة أطول من ١٠٠٠ حرف."` |
  | `t.help.errors.bad_file` | `"تعذّر إرفاق الملف. حاول مرة أخرى."` |
  | `t.help.errors.generic` | `"تعذّر الإرسال. تأكد من الإنترنت ثم حاول مرة أخرى."` |

- [ ] **Step 1: Write the failing tests.** Mock `convex/react`, `captureScreen`, `useVoiceRecorder`, `sendHelp`:
  - **Send button.** It's disabled with only a screenshot, and enabled with text.
  - **Screenshot.** × removes it, and the request is sent with `screenshot: null`.
  - **Voice hidden (Review Focus 4).** The voice control isn't rendered when `supported` is false or the state is `denied`.
  - **Sending.** It calls `sendHelp` with the context and shows the sent screen. An error code shows its copy.
  - **Reply card.** `HelpReplyCard` renders only with an unread request, and opens the conversation.
  - **Deep link.** `useHelpDeepLink` opens the conversation from `?help=<id>` even when the route then changes, and removes the query.
  - **Celebration.** `HelpButton` isn't rendered while a `CelebrationPage` is mounted.
  - **Claiming (Review Focus 3).** `useClaimVisitorHelp` calls `claimVisitorRequests` once and forgets the token. Without a reporter token it does nothing.
  - **Reporter token.** `ensureReporterToken` returns the same value twice.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Check the header spacing on Home, Khatma, Organizer, Settings and Create in the browser preview. Run the website's dev server against the local Convex backend, or with `VITE_CONVEX_URL` for staging, which has the help functions after Task 2 deploys. Take a mobile-width screenshot of each.
- [ ] **Step 4: Run the tests.** `bun run test apps/web && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add the help button, the help sheet and replies to the website`.

### Task 9: Microphone permission and the privacy policy

**Files:**
- Modify: `apps/web/vercel.json` (`Permissions-Policy: camera=(), microphone=(self), geolocation=()`)
- Modify: `apps/web/public/privacy.html` (a new section)
- Test: extend `apps/web/src/privacy.node.test.ts`, and add `apps/web/src/vercelHeaders.node.test.ts`

**Interfaces:**
- The new privacy section, in the page's existing style, titled "طلبات المساعدة", says:
  - **What's collected:** the text, voice notes, the screenshot, and the context (page, app version, browser, screen size, time zone).
  - **Who reads it:** Wirdak's admins.
  - **How long it's kept:** files for 30 days after the request closes, and the conversation for 180 days.
  - **Leaving out the screenshot:** you can remove it before sending.

- [ ] **Step 1: Write the failing tests.**
  - The headers test reads `apps/web/vercel.json` and expects `microphone=(self)`.
  - The privacy test expects a heading "طلبات المساعدة". The text between that heading and the next one must contain "صورة الشاشة", "تسجيل صوتي", "٣٠ يوماً" and "١٨٠ يوماً". The page already uses those day counts for notes, so the test must look only inside the new section.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test apps/web`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: allow the microphone and explain help requests in the privacy policy`.

### Task 10: The help inbox in the admin app

**Files:**
- Create: `apps/admin/src/pages/HelpInboxPage.tsx`, `apps/admin/src/pages/HelpRequestPage.tsx`
- Modify: `apps/admin/src/App.tsx` (routes `/help` and `/help/:requestId`), `apps/admin/src/components/Layout.tsx` (nav item "المساعدة" after الرئيسية, with an open-count badge from `adminHelp.counts`), `apps/admin/src/pages/HomePage.tsx` (an open-requests card at the top, from `counts`, linking to `/help`), `apps/admin/src/i18n/ar.ts` (`t.help`)
- Test: `HelpInboxPage.test.tsx`, `HelpRequestPage.test.tsx`

**Interfaces:**
- `HelpInboxPage`: three tabs (open, answered, closed) using `usePaginatedQuery(api.adminHelp.list, …)`. Each row shows:
  - the first line,
  - voice and screenshot markers,
  - `who ?? t.help.visitor` (`"زائر"`),
  - the khatma name,
  - how long ago (`formatDate`).
- `HelpRequestPage`:
  - The messages in order.
  - The screenshot, which opens full size.
  - An `<audio controls>` element per voice note.
  - Context in a small table.
  - Links: the person's phone with a `tel:` link, and the khatma's public page on the website (`{siteUrl}/j/<inviteCode>`, with `siteUrl` from `VITE_SITE_URL`, defaulting to `https://wirdak.app`). Plan 3c turns these into lookup pages.
  - A reply textarea and send button. Close or reopen sits behind a confirm sheet.
  - Deleted attachments show `t.help.deleted` (`"حُذف"`).

- [ ] **Step 1: Write the failing tests:**
  - The inbox shows "زائر" for a visitor row, and switching tabs changes the `status` argument.
  - The request page sends a reply with the typed text and shows the server's error copy.
  - Close asks for confirmation before calling `close`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** `bun run test apps/admin && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add the help inbox to the admin app`.

### Task 11: Admin push in the admin app

**Files:**
- Create: `apps/admin/public/sw.js`, `apps/admin/src/lib/adminPush.ts`, `apps/admin/src/components/AdminPushCard.tsx`
- Modify: `apps/admin/src/pages/HomePage.tsx` (render `AdminPushCard`), `apps/admin/vercel.json` (`sw.js` with `Cache-Control: public, max-age=0, must-revalidate`, like the website)
- Test: `apps/admin/src/components/AdminPushCard.test.tsx`

**Interfaces:**
- `apps/admin/public/sw.js` is the website's `sw.js` without the `pushsubscriptionchange` relay. The default title is `"وِردك · الإدارة"`, and a notification tap opens `data.url` on the admin origin only.
- `adminPush.ts`:
  - `adminPushSupport(): "ready" | "ios_install" | "unsupported"`, the same rules as `@web/lib/push`'s `pushSupport`. Reuse it by import if its signature allows.
  - `enableAdminPush(adminToken: string): Promise<"on" | "denied" | "failed">`. It registers `/sw.js`, subscribes with `api.push.publicKey`, and calls `adminPush.subscribe`.
  - `disableAdminPush(adminToken: string): Promise<void>`.
- `AdminPushCard`:
  - **Off on this device:** an "شغّل التنبيهات على هذا الجهاز" button.
  - **On:** a `SwitchRow` "تنبيه بطلبات المساعدة" bound to `setNotifyHelp`, and a "أوقف التنبيهات على هذا الجهاز" link.
  - **iPhone outside the home-screen app:** says to add the admin app to the home screen first.
- Admin copy, verbatim, in `t.adminPush`:
  - `on`: `"شغّل التنبيهات على هذا الجهاز"`
  - `off`: `"أوقف التنبيهات على هذا الجهاز"`
  - `help`: `"تنبيه بطلبات المساعدة"`
  - `iosInstall`: `"أضف لوحة الإدارة إلى الشاشة الرئيسية أولاً، ثم شغّل التنبيهات."`
  - `unsupported`: `"هذا المتصفح لا يدعم التنبيهات."`
  - `denied`: `"التنبيهات ممنوعة لهذا الموقع في إعدادات المتصفح."`

- [ ] **Step 1: Write the failing tests:**
  - The card offers "turn on" when `mine.thisDevice` is false.
  - It shows the switch when true, and the switch calls `setNotifyHelp({ on: false })`.
  - On an unsupported browser it shows only the explanation.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the whole suite and build both apps.** `bun run test && bun run typecheck && bun run lint`, then `(cd apps/web && VITE_CONVEX_URL=https://x-1.eu-west-1.convex.cloud bun run build)` and the same for `apps/admin`. Expected: PASS, and both builds succeed.
- [ ] **Step 5: Commit.** `feat: let admins turn on push for help requests`.

### Task 12: End-to-end check on staging

- [ ] **Step 1:** Once merged and deployed to staging, send a signed-out help request from an iPhone on `stg.wirdak.app`, with text, a voice note, and the screenshot.
- [ ] **Step 2:** Confirm the admin push arrives on the admin's phone (after turning it on in `stg-admin.wirdak.app`). Its text shows nothing of the request.
- [ ] **Step 3:** In the inbox, open the request. Check the screenshot, play the voice note, and reply.
- [ ] **Step 4:** On the iPhone, open Wirdak again. The reply shows in the help sheet. Sign in on that browser and confirm the request moved to the account.
- [ ] **Step 5:** Repeat signed in, with push on for a khatma. Confirm the reply arrives as a push, outside quiet hours.
- [ ] **Step 6:** Close the request in the admin app, and confirm `help.close` is in the audit log.
