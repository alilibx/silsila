# WhatsApp templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the sign-in PIN as Meta's authentication template, put the links in sign-in replies behind buttons, and send every notification on WhatsApp as an approved utility template to people who opted in.

**Architecture:** `convex/whatsapp.ts` gains one shared Graph sender with three payload builders (text, template, link button). A pure module `convex/lib/whatsappTemplates.ts` turns a note into a template name and parameters. A new `convex/whatsappNotes.ts` (plan query, mark mutation, deliver action, sample action) is scheduled from `notify` next to push. The web app gets an opt-in switch on Settings and an offer in the post-first-juz' sheets.

**Tech Stack:** Convex (queries, mutations, actions, scheduler), convex-test + Vitest, React + Testing Library, WhatsApp Cloud API (Graph `v26.0` from `WHATSAPP_GRAPH_VERSION`).

**Spec:** `docs/superpowers/specs/2026-10-29-wirdak-whatsapp-templates-design.md`

## Global Constraints

- Template language code: `ar`. Names: `wirdak_pin`, `wirdak_almost_up`, `wirdak_open_for_help`, `wirdak_open_for_help_many`, `wirdak_thanks`, `wirdak_reminder`, `wirdak_behind`, `wirdak_completed`, `wirdak_now_organizer`, `wirdak_organizer_moved`. Keep the names in one table so a rename (for example `wirdak_thanks` → `wirdak_juz_helped`) is one line.
- Utility template components: header with one text parameter (the khatma title), body with 0 or 1 text parameter, URL button index 0 with one suffix parameter.
- The button base is `https://wirdak.app/`. The suffix is `j/<inviteCode>`, or `stg/j/<inviteCode>` when `siteUrl()` is `https://stg.wirdak.app`.
- `wirdak_pin`: body parameter is the PIN, and button index 0 (`sub_type: "url"`) has parameter text equal to the PIN (Meta's copy-code button is a URL button underneath).
- Parameters: collapse every run of whitespace (including newlines and tabs) to one space and trim. The header is at most 60 characters.
- Prod logs: HTTP status and Graph `error.code` only. Never log phone numbers, PINs, tokens or parameters unless `isDev()`.
- No sign-in token in any URL. The alert token is allowed only in the sign-out link button, as today.
- Commit messages: Conventional Commits, ending with `Refs: ARQ-275`, no AI attribution (CLAUDE.md).
- All of `bun run typecheck`, `bun run lint`, `bun run test` pass at the end of every task.

## Review Focus

1. Someone turns WhatsApp off, or turns the khatma's notifications off, after a note is scheduled. `deliver` must send nothing. (Task 4 test `deliver skips when opted out after scheduling`.)
2. `deliver` runs during quiet hours, for example after a scheduler delay. It must reschedule for the next waking moment and send nothing now. (Task 4 test `deliver reschedules inside quiet hours`.)
3. The PIN template is refused by Graph (still in review, paused, or a 4xx). The person must still get a PIN, as the old text reply. (Task 2 test `sendPin falls back to text when the template fails`.)
4. A khatma name with a newline, a tab or a run of spaces, or an unnamed khatma. The header must be one clean line, at most 60 characters, or `ختمة <date>`. (Task 3 tests `khatmaTitle` and `cleanParam`.)
5. A batched "open for help" alert that grows after its WhatsApp message went out. No second WhatsApp message. (Task 4 test `a grown openForHelp alert is not sent again on WhatsApp`.)

---

### Task 1: Shared Graph sender with template and link payloads

**Files:**
- Modify: `convex/whatsapp.ts` (Outbound section, lines ~209-280)
- Test: `convex/whatsapp.test.ts`

**Interfaces:**
- Produces:
  - `type TemplateMessage = { name: string; header?: string; body?: string[]; buttonParam?: string }`
  - `async function sendWhatsAppTemplate(to: string, message: TemplateMessage): Promise<boolean>`
  - `async function sendWhatsAppLink(to: string, body: string, button: { label: string; url: string }): Promise<boolean>`
  - `sendWhatsAppText(to, body)` keeps its signature.
  - `function cleanParam(value: string): string` (exported for Task 3)
- All three senders call one private `postMessage(to: string, payload: object): Promise<boolean>` that holds today's token, config, retry and logging logic. The dev path with no token logs `[whatsapp:dev] to +<digits>:` plus a readable summary (the text, the template name and its parameters, or the body plus the button URL).

- [ ] **Step 1: Write the failing tests.** Change the test `fetch` stub so it records the whole parsed payload (`sent[i].payload`), not only `text.body`, and keep a `body` field for text messages so the existing assertions still read. Add these tests:
  - `sendWhatsAppTemplate posts a template with header, body and url button`: expect payload `{ messaging_product: "whatsapp", to: "971501234567", type: "template", template: { name: "wirdak_reminder", language: { code: "ar" }, components: [{ type: "header", parameters: [{ type: "text", text: "ختمة رمضان" }] }, { type: "body", parameters: [{ type: "text", text: "١٢" }] }, { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "j/AB12CD" }] }] } }`.
  - `sendWhatsAppTemplate leaves out empty components`: with no `header` and `body: []`, `components` holds only the button.
  - `sendWhatsAppLink posts an interactive cta_url`: expect `type: "interactive"`, `interactive: { type: "cta_url", body: { text: "…" }, action: { name: "cta_url", parameters: { display_text: "ارجع إلى وِردك", url: "https://wirdak.example/j/X" } } }`.
  - `template send failures log the Graph error code only`: a 400 response `{ error: { code: 132001 } }` with `WIRDAK_ENV` unset gives `false` and the log line `whatsapp send failed: HTTP 400 code 132001`.
- [ ] **Step 2: Run** `bun run test convex/whatsapp.test.ts`. Expected: the new tests FAIL (functions not exported).
- [ ] **Step 3: Implement** `postMessage`, `sendWhatsAppTemplate`, `sendWhatsAppLink` and `cleanParam` in `convex/whatsapp.ts`. In prod, the log line reads `error.code` from the JSON response when there is one.
- [ ] **Step 4: Run** `bun run test convex/whatsapp.test.ts`. Expected: PASS, old tests included.
- [ ] **Step 5: Commit** `feat(whatsapp): send templates and link-button messages`.

### Task 2: Sign-in replies use the PIN template and link buttons

**Files:**
- Modify: `convex/whatsapp.ts` (message texts, `takeIncoming`, `handleIncoming`)
- Modify: `convex/verification.ts:30-40,176-183,585-595,632-638`
- Modify: `convex/http.ts:282`
- Test: `convex/whatsapp.test.ts`, `convex/verification.test.ts`

**Interfaces:**
- Consumes: Task 1 senders.
- Produces:
  - `async function sendPin(to: string, pin: string): Promise<boolean>`: tries `wirdak_pin` (body `[pin]`, `buttonParam: pin`), and if that returns `false`, sends `pinReply(pin)` as text.
  - `async function sendVerified(to: string, returnPath?: string): Promise<boolean>`: with `siteUrl()` set, sends a link message with body `تمّ التحقق ✅ ارجع إلى وِردك لتكمل.` and button `ارجع إلى وِردك` → `${siteUrl()}${path}`. Without it, sends the plain text.
  - `async function sendSignInAlert(to: string, created: boolean, deviceLabel: string, alertToken: string): Promise<boolean>`: a link message. Body for an existing account: `تسجيل دخول جديد إلى وِردك من ${deviceLabel}. إن لم تكن أنت، اضغط الزر لتسجيل الخروج من الأجهزة الأخرى.`, button `سجّل الخروج من الأجهزة الأخرى`. Body for a new account: `تمّ إنشاء حساب في وِردك برقمك من ${deviceLabel}. إن لم تكن أنت، اضغط الزر لتسجيل الخروج من كل الأجهزة.`, button `سجّل الخروج من كل الأجهزة`. URL `${siteUrl()}/signout?t=${alertToken}` in both. Button labels are at most 20 characters (Meta's limit for `display_text`); both labels above fit.
  - `takeIncoming(ctx, message)` drops its `send` parameter. It calls `sendVerified` and `sendPin`. `matchedReply`, `signInAlert` and `accountCreatedAlert` become unused and are removed. `pinReply` stays as the fallback.
- [ ] **Step 1: Write the failing tests:**
  - In `whatsapp.test.ts`: `a matched code gets a link-button reply` (payload `type: "interactive"`, URL ends with the return path); `an existing account gets the PIN template` (template `wirdak_pin`, body parameter equals the button parameter, both 6 digits); `sendPin falls back to text when the template fails` (stub returns 400 for the template, 200 for the text; two requests, the second a text containing the PIN).
  - In `verification.test.ts`, update the existing claim and confirm-PIN tests that read the alert text. They now read `interactive.body.text` and `interactive.action.parameters.url` (`/signout?t=` followed by the raw alert token). `needs_pin` from `claim` sends `wirdak_pin`.
- [ ] **Step 2: Run** `bun run test convex/whatsapp.test.ts convex/verification.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the three helpers and rewire `takeIncoming`, `handleIncoming`, `http.ts` relay, `claim` and `confirmPin`. Fix every other test fake that parsed `text.body` in `convex/*.test.ts` (grep `text: { body`).
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(whatsapp): PIN template with copy button, link buttons in sign-in replies`.

### Task 3: Note → template mapping (pure)

**Files:**
- Modify: `convex/lib/noteText.ts` (export `juzList`, add `behindPhrase`)
- Create: `convex/lib/whatsappTemplates.ts`
- Test: `convex/lib/whatsappTemplates.test.ts`, `convex/lib/noteText.test.ts` stays green

**Interfaces:**
- Consumes: `NoteTextInput`, `NoteKind` from `noteText.ts`, `cleanParam` from Task 1, `toArabicDigits`.
- Produces:
  - `export function behindPhrase(count: number, until: number | null, now: number): string` in `noteText.ts`. Returns `٣ أجزاء قبل الخميس`, or `٣ أجزاء` when `until` is null or past. `noteText`'s `behind` case uses it.
  - `export const NOTE_TEMPLATES: Record<NoteKind, string>` plus `OPEN_FOR_HELP_MANY = "wirdak_open_for_help_many"`.
  - `export function khatmaTitle(k: { name: string | null; createdAt: number }): string`: the name, or `ختمة ${toArabicDigits(date)}` with `Intl.DateTimeFormat("ar", { timeZone: "Asia/Dubai", weekday: "long", day: "numeric", month: "long" })`. Cleaned with `cleanParam` and cut to 60 characters.
  - `export function buttonSuffix(inviteCode: string, site: string): string`: `stg/j/${code}` when `site === "https://stg.wirdak.app"`, else `j/${code}`.
  - `export function noteTemplate(note: NoteTextInput, khatma: { name: string | null; createdAt: number; inviteCode: string }, site: string, now?: number): TemplateMessage`
- [ ] **Step 1: Write the failing tests:**
  - `noteTemplate` for every kind: name and `body` (`[]` for completed, nowOrganizer and organizerMoved; `["١٢"]` for single-juz' kinds).
  - openForHelp `[12]` → `wirdak_open_for_help`, `["١٢"]`; `[3,12,15]` → `wirdak_open_for_help_many`, `["٣، ١٢ و١٥"]`.
  - behind with `until` 2 days ahead → body `["٣ أجزاء قبل <weekday>"]`; with `until` past → `["٣ أجزاء"]`.
  - `khatmaTitle({ name: null, createdAt })` starts with `ختمة ` and has Arabic digits; `khatmaTitle({ name: "ختمة\n  الوالدة\t" })` → `ختمة الوالدة`.
  - `buttonSuffix("AB12", "https://stg.wirdak.app")` → `stg/j/AB12`; with `"https://wirdak.app"` → `j/AB12`.
  - `noteText` `behind` output is unchanged (existing tests).
- [ ] **Step 2: Run** `bun run test convex/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test convex/lib`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(whatsapp): map notes to utility templates`.

### Task 4: Opt-in field, delivery and sample sender

**Files:**
- Modify: `convex/schema.ts` (`people.whatsappNotes: v.optional(v.boolean())`, `notes.whatsappSentAt: v.optional(nullableNumber)`)
- Modify: `convex/notes.ts` (`notify` schedules WhatsApp)
- Create: `convex/whatsappNotes.ts`
- Modify: `convex/people.ts` (`setWhatsappNotes`), `convex/sessions.ts` (`me` returns `whatsappNotes: boolean`)
- Test: `convex/whatsappNotes.test.ts`, `convex/people.test.ts`, `convex/schema.test.ts` if it lists fields

**Interfaces:**
- Consumes: Task 3 `noteTemplate`, Task 1 `sendWhatsAppTemplate`, `nextAwake`, `quietHours`, `activeMembership`.
- Produces:
  - `internal.whatsappNotes.plan({ noteId })` (internalQuery): returns `{ phone, message: TemplateMessage } | { retryAt: number } | null`. Null when the note is cleared or already has `whatsappSentAt`, the member isn't active or has `notificationsOn` false, or the person has no `whatsappNotes`. `retryAt` is `nextAwake(now, tz, quietHours)` when that is later than `now`.
  - `internal.whatsappNotes.markSent({ noteId })` (internalMutation)
  - `internal.whatsappNotes.deliver({ noteId })` (internalAction): runs `plan`. On `retryAt`, it reschedules itself with `runAt` and returns. Otherwise it marks the note sent, then sends. Marking first means a crash never double-sends.
  - `internal.whatsappNotes.sendSample({ phone, kind })` (internalAction): throws unless `WIRDAK_ENV` is `dev` or `staging`. Finds the person by `phone` (E.164) and their most recently joined active membership's khatma. Builds a note with that kind (`juz: [12]`, `[3,12,15]` for kind `openForHelp` when `many: true` is passed, `count: 3`, `until: now + 2 days`) and sends it with no opt-in checks.
  - `api.people.setWhatsappNotes({ on: boolean })` (sessionMutation): returns `{ ok: boolean }`; false when signed out.
  - `notify` schedules `deliver` at the same `at` as push when the member's `notificationsOn` and the person's `whatsappNotes` are on, whether or not a push subscription exists. `alertOrganizer` is unchanged, so a grown alert is pushed again but not sent again on WhatsApp.
- [ ] **Step 1: Write the failing tests** (convex-test, fetch stub as in `whatsapp.test.ts`, fake timers):
  - `notify schedules a WhatsApp delivery for an opted-in member without push`, then run the scheduled functions: one template request to the person's phone with the khatma title header and suffix `j/<code>`.
  - `notify schedules nothing for WhatsApp when whatsappNotes is missing`.
  - `deliver skips when opted out after scheduling`: notify, then `setWhatsappNotes({ on: false })`, run scheduled: no request.
  - `deliver skips a cleared note`.
  - `deliver reschedules inside quiet hours`: system time 23:00 Asia/Dubai, call `deliver` directly: no request, and one scheduled `deliver` at 07:00.
  - `a grown openForHelp alert is not sent again on WhatsApp`: two `alertOrganizer` calls in the batch window after the first delivery: one template request in total.
  - `sendSample refuses on prod`: with `WIRDAK_ENV` `prod` it throws.
  - `setWhatsappNotes` round trip through `sessions.me`.
- [ ] **Step 2: Run** `bun run test convex/whatsappNotes.test.ts convex/people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(whatsapp): send notifications on WhatsApp to people who opt in`.

### Task 5: Web opt-in (Settings and the post-first-juz' offer)

**Files:**
- Modify: `apps/web/src/i18n/ar.ts`
- Modify: `apps/web/src/pages/SettingsPage.tsx` (new section after the push section)
- Create: `apps/web/src/components/WhatsAppOffer.tsx` (the secondary button) and `apps/web/src/components/WhatsAppSheet.tsx` (unsupported browsers)
- Modify: `apps/web/src/components/PushPromptSheet.tsx`, `apps/web/src/components/InstallStepsSheet.tsx`, `apps/web/src/features/khatma/useKhatmaActions.ts:237-243`, `apps/web/src/pages/KhatmaPage.tsx:138-143`
- Test: `apps/web/src/pages/SettingsPage.test.tsx`, `apps/web/src/components/PushPromptSheet.test.tsx`, `apps/web/src/components/InstallStepsSheet.test.tsx`, `apps/web/src/pages/KhatmaPage.push.test.tsx`

**Interfaces:**
- Consumes: `api.people.setWhatsappNotes`, `api.sessions.me` → `whatsappNotes`.
- Produces copy in `t.whatsappNotes`: `heading: "رسائل واتساب"`, `label: "رسائل واتساب"`, `explain: "نرسل لك تنبيهات ختماتك على واتساب، على رقمك المسجّل."`, `offer: "أرسلها لي على واتساب"`, `sheetTitle: "التنبيهات على واتساب"`, `sheetBody: "هذا المتصفح لا يدعم الإشعارات. نستطيع أن نرسل لك تنبيهات ختماتك على واتساب، على رقمك المسجّل."`, `notNow` reusing `t.push.notNow`, `on: "ستصلك التنبيهات على واتساب"` (toast).
- `WhatsAppOffer({ onDone }: { onDone: () => void })`: renders nothing while `me` is loading or when `me.whatsappNotes` is true. Otherwise it renders a ghost `Button` with `t.whatsappNotes.offer` that calls `setWhatsappNotes({ on: true })`, then `onDone()`.
- `offerPush`: on `"unsupported"`, marks asked and opens `{ kind: "whatsapp" }` (add to `OpenSheet`). `KhatmaPage` renders `WhatsAppSheet` for it.
- [ ] **Step 1: Write the failing tests:** the Settings switch reflects `me.whatsappNotes` and calls the mutation with `{ on: true }`; `PushPromptSheet` and `InstallStepsSheet` show the offer button when WhatsApp is off and hide it when on; the first take on an unsupported browser opens the WhatsApp sheet. Mock Convex the way the neighboring tests already do.
- [ ] **Step 2: Run** `bun run test apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun run test && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): let people turn on WhatsApp messages`.

### Task 6: Staging redirect, privacy page, docs

**Files:**
- Modify: `apps/web/vercel.json` (add `"redirects": [{ "source": "/stg/:path*", "destination": "https://stg.wirdak.app/:path*", "permanent": false }]`)
- Modify: `apps/web/public/privacy.html` (Arabic and English WhatsApp sections and the Meta processor line: opted-in members get khatma alerts on WhatsApp, and Meta receives the khatma title and juz' numbers for them)
- Modify: `docs/deploy.md` (a "WhatsApp templates" subsection: the template list, that staging and production share them, the `/stg/` redirect, and the `sendSample` command)
- Modify: `docs/superpowers/specs/2026-10-28-wirdak-plan3-design.md:36` and `docs/superpowers/specs/2026-10-28-wirdak-plan2-design.md:34` (point to the new spec)
- Test: `apps/web/src/privacy.node.test.ts` stays green; add an assertion there if it checks section text.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Run** `bun run test && bun run typecheck && bun run lint`. Expected: PASS.
- [ ] **Step 3: Commit** `docs: WhatsApp templates in deploy notes, privacy page, staging redirect`.

### Task 7: Staging test (manual, after approval)

- [ ] **Step 1:** Check that every template is APPROVED and UTILITY (`whatsapp_biz_list_templates`).
- [ ] **Step 2:** Run the Deploy workflow for staging with `ref` set to the branch (`gh workflow run deploy.yml -f environment=staging -f ref=<branch>`), then wait for it to succeed.
- [ ] **Step 3:** On staging: `bun run convex run --deployment manzilo:wirdak:staging whatsappNotes:sendSample '{"phone":"<Ali's E.164>","kind":"<kind>"}'` for each of the 8 kinds, plus `openForHelp` with `many: true`.
- [ ] **Step 4:** Sign in on `stg.wirdak.app` with Ali's number on a fresh browser to get the verified link button, the PIN template (an existing account), and the sign-in alert.
- [ ] **Step 5:** Ali confirms on his phone: all arrived, copy-code works, no raw URLs.
