# Wirdak (وِردك) plan 3 design: help requests, admin panel, stats, live settings

- **Date:** 2026-10-28
- **Linear:** [ARQ-270](https://linear.app/manzilo/issue/ARQ-270) (plan 3), under [ARQ-245](https://linear.app/manzilo/issue/ARQ-245) (v1 umbrella), project Wirdak · وِردك
- **Builds on:** `docs/superpowers/specs/2026-10-27-silsila-v1-design.md` (the "v1 spec", section 5.5) and `docs/superpowers/specs/2026-10-28-wirdak-plan2-design.md` (the "plan 2 spec", section 9), plus what shipped through v0.2.1 and PR #18
- **Status:** draft, waiting for Ali's approval

Items marked **[builder's call]** are decisions made while writing this up, not by Ali. Ali didn't decide them and can overturn any of them. Everything else is Ali's, from the plan 3 brainstorm (2026-10-28) or from v1 spec 5.5.

## 1. Intent

Plan 3 is the last piece of v1: the admin panel. The v1 spec described it mostly as a place to edit settings. The brainstorm moved the weight. Ali opens the admin panel for three reasons, in this order:

1. **Someone needs help.** A person is stuck. They tell Wirdak from inside the app, with words, a voice note, and a picture of the screen they're stuck on. Ali gets told right away, sees what happened, fixes it, and answers them inside Wirdak.
2. **How is Wirdak doing?** Ali gets told when Wirdak passes a milestone ("100 khatmas", "1,000 members") and gets a short summary every morning, without having to go and look. When he does open the panel, he sees proper stats: totals, trends over time, and whether sign-in is working.
3. **Run it remotely.** Change a setting, turn on maintenance mode, post an announcement, block an abuser, or fix a khatma when its organizer asks. All without a release, and all on the record.

So plan 3 has two halves: a **help button** in the website, which every member sees, and the **admin panel**, which only admins see.

## 2. Goals, non-goals, and anti-goals

### Goals

1. **Asking for help** from any screen of the website, with text, a voice note, and an automatic screenshot, and answers that come back inside Wirdak (section 3).
2. **An admin app** at `admin.wirdak.app` with its own sign-in, an admin allowlist, and an audit log (section 4).
3. **A help inbox** where admins read requests, reply, and close them (section 5).
4. **Stats:** a front page of totals and trends, built from group totals only (section 6).
5. **Admin notifications:** new help requests, a morning summary, and milestones, by web push to the admin's phone (section 7).
6. **Lookup and operations** from v1 spec 5.5: find a khatma or a person, sign someone out everywhere, block or unblock a number, reset an invite link, hand over the organizer role (section 8).
7. **Live settings:** every key in `SETTING_DEFAULTS` editable and validated, plus an announcement banner, a maintenance screen, and a minimum client version that the website actually honors (section 9).

### Non-goals (plan 3)

- **Content settings from v1 spec 5.5:** schedule options, celebration duas, and WhatsApp message templates. Each needs its own validation (the duas against the verified mushaf source), and none hurts while it lives in code **[builder's call]**.
- **Feature flags.** Nothing is behind a flag yet. Add the first flag with the first feature that needs one **[builder's call]**.
- **WhatsApp messages from the app**, including answering help requests over WhatsApp. Business-started messages need Meta-approved templates. Unchanged from the plan 2 spec. Since then, the WhatsApp templates design (`2026-10-29-wirdak-whatsapp-templates-design.md`, ARQ-275) sends notifications on WhatsApp to people who opt in.
- **Deleting or correcting a person from the panel.** The privacy policy promises a copy, correction, or deletion on request by email. Those stay manual for now, through the Convex dashboard, because deletion reaches nearly every table and needs its own design and tests. Until it's built, Ali records each manual deletion as a note on the person's help request or in Linear **[builder's call: Ali can pull it into plan 3]**. It's a follow-up Linear issue when the build starts.
- **Admin roles.** Every admin can do everything. A second role comes when there's a second kind of admin **[builder's call]**.
- **Exporting data**, CSV downloads, and outside analytics tools.
- The English UI, the mobile apps, reading in the app, and AI. Unchanged.

### Anti-goals

The v1 and plan 2 anti-goals still decide every edge case: no shaming, no ranking people, no pressure, no complexity. Plan 3 adds three:

- **Watching people read.** The admin panel never charts, lists, or ranks one person's reading. It doesn't rank khatmas either **[builder's call]**. Stats are group totals. A person's page shows their account, not their pace.
- **A support desk that feels like a call center.** No ticket numbers, no "your request has been escalated", no forms with ten fields. The person writes or talks as they would to a friend who can fix things.
- **Admin power without a record.** Anything an admin changes, in settings or in someone's data, is in the audit log, with who did it and when.

## 3. Asking for help (website)

### 3.1 The button

A small "؟" sits in the header of **every screen** (Ali: option A in the brainstorm). That includes the signed-out screens, because "I can't sign in" is one of the most likely reasons to ask.

Tapping it does two things, in order:

1. It captures a picture of the current screen, as it looks right now, without the sheet on top.
2. It opens the help sheet.

### 3.2 The help sheet

Title "محتاج مساعدة؟", a one-line explanation ("اكتب أو سجّل رسالة، وسنرد عليك هنا."), then:

- **A text box.** Up to 1,000 characters **[builder's call]**.
- **The screenshot**, shown as a thumbnail and attached by default. A × removes it. Tapping the thumbnail shows it full size, so the person can see what they're sending, because it may show other members' names.
- **A voice note.** Tap to record, tap to stop. Up to 2 minutes **[builder's call]**. The person can play it back and delete it before sending. If the browser can't record, or the person refuses the microphone, the button hides and the sheet still works with text.
- **Send.** It is enabled when there's text or a voice note. A screenshot alone isn't enough, because a picture with no words rarely says what's wrong **[builder's call]**.

After sending: "وصلتنا رسالتك. سنرد عليك هنا في وِردك، وسيصلك تنبيه." and a "تم" button.

How the screenshot is made **[builder's call]**: a website can't take a real phone screenshot. Wirdak renders its own page to an image in the browser (a DOM-to-image library such as `modern-screenshot`), scaled down to fit under 2 MB as JPEG. It's close to what the person saw but not pixel-perfect. If rendering fails, the sheet opens without a screenshot and says nothing about it.

Voice notes use `MediaRecorder`. iPhone Safari records `audio/mp4`, other browsers usually `audio/webm`. Both are stored as they come; the admin panel plays them with a plain `<audio>` element. The site's `Permissions-Policy` header currently says `microphone=()`, which blocks recording. It must become `microphone=(self)` in `apps/web/vercel.json`.

### 3.3 What's attached without asking

Every request carries, without the person typing it:

- Who they are, if signed in: their person record and display name.
- Which khatma, if they were on a khatma page (or its organizer page).
- The page path, the app version, the browser's user agent, the screen size, and the time zone. The app version is the release from the **root** `package.json`, which release-please bumps, baked in at build time. `apps/web/package.json` stays at 0.0.0 and must not be used.

Nothing else. In particular, no list of their other khatmas, no reading history, and no session token **[builder's call]**.

### 3.4 Answers, and talking back

A request is a short conversation. An admin's reply shows up:

- **In the app.** A card on the home page ("رد من فريق وِردك") with the reply and a button to open the conversation. The conversation also opens from the help sheet, which lists the person's open and recent requests above the text box.
- **As a push**, if the person has push turned on for at least one khatma on that browser. It follows the quiet hours (22:00 to 07:00) like every other push **[builder's call]**.

Replies are signed "فريق وِردك", never with the admin's name **[builder's call]**.

The person can answer back from the conversation, with text or a voice note (no new screenshot) **[builder's call]**.

States **[builder's call]**:

- **Open:** waiting for an admin. Sending a new request or answering back puts it here.
- **Answered:** an admin replied and is waiting for the person.
- **Closed:** an admin closed it, or it sat Answered for 14 days with no word from the person. The person can still read it. Answering back reopens it.

### 3.5 Signed-out requests

A signed-out person can ask for help too. The browser keeps a random reporter token in local storage, and the request is tied to it. The answer shows up on that same browser, in the help sheet and on the sign-in screen. There's no push, because push needs a signed-in session.

If the person signs in later on the same browser, their open requests move to their account **[builder's call]**.

Signed-out requests get tighter limits (section 3.6), because nobody is accountable for them.

### 3.6 Limits and storage

- Files live in Convex file storage. Uploads go through short-lived upload URLs, issued only to a caller who is under the limits below.
- Screenshot: one per request, JPEG or PNG, at most 2 MB. Voice note: at most 2 minutes and 3 MB. The server checks type and size after upload and deletes anything that doesn't fit **[builder's call]**.
- Limits, all settings (section 9) **[builder's call: the numbers]**:
  - New requests: 5 per person per day; 3 per reporter token per day and 10 per IP per day when signed out.
  - Convex only exposes the client IP to HTTP actions (`ctx.meta.getRequestMetadata()`, as `/api/verification/start` uses it), not to mutations. So a signed-out request is created through an HTTP endpoint on the Convex site, with the same CORS rule as `/api/verification/start`, and that endpoint applies the per-IP limit. Signed-in requests can be normal mutations **[builder's call]**.
  - Messages in a conversation: 20 per person or reporter token per hour.
  - Uploads that are never attached to a message are deleted after an hour.
- Retention **[builder's call]**: screenshots and voice notes are deleted 30 days after the request closes. The conversation itself is deleted 180 days after it closes. The admin panel says "deleted" where an attachment used to be.
- Maintenance mode (section 9.3) doesn't block help requests. That's when people need them most.

## 4. The admin app

### 4.1 Where it lives

- A separate Vite + React app in `apps/admin`, as in the v1 spec, served at `admin.wirdak.app`. Staging gets `stg-admin.wirdak.app` **[builder's call]**. Each talks to its environment's Convex deployment.
- Arabic, right to left, with the website's look (colors, fonts, the star pattern). It's built for a phone first, because that's where Ali will be when a push arrives, and it widens to two columns on a desktop **[builder's call]**.
- Every page answers `X-Robots-Tag: noindex, nofollow`, and the app keeps the website's other security headers.
- The look is shared, not copied. Shared UI pieces (button, sheet, tile, the theme CSS) move into a workspace package that both apps import, or the admin imports them from `apps/web` through an alias. That's left to the builder, but the two apps mustn't drift apart **[builder's call]**.

### 4.2 Signing in

Admins sign in with the same WhatsApp verification as the website (Ali, v1 spec 5.5), with three differences:

- **The 6-digit code step is always required**, even on a browser that has signed in before, and even if the number has no member account. The WhatsApp reply is the code message, worded for the admin panel ("رمز الدخول إلى لوحة إدارة وِردك"). Like today's code message, it has no link, because the admin page that started the sign-in is already waiting for the code **[builder's call]**.
- **Only phone numbers on the admin allowlist can finish.** A number that isn't on it gets the same generic failure as an expired code. The admin panel never reveals whether a number is an admin **[builder's call]**.
- **A verification records which app started it** (website or admin). The member flow (`matchIncoming`, `takeIncoming`, and the production-to-staging relay) keeps its current behavior for website sign-ins.
- **An admin verification never touches `people`.** Today's code step (`toNeedsPin`) needs an existing member (`existingPersonId`). An admin verification points at the `admins` row for its phone instead, and signing in makes an admin session, never a member account. A number that's an admin but not a member stays not a member **[builder's call]**.
- **Admin codes are relayed like member codes.** Staging shares production's number, so a sign-in started on `stg-admin.wirdak.app` reaches production first. Production relays it to staging the same way (`docs/deploy.md`, "WhatsApp on staging"), and staging's relay handler must recognize admin verifications and send the admin code reply itself.
- **Every admin sign-in sends a WhatsApp alert**, like the member "new sign-in" alert, with its own one-tap link that ends all of that admin's sessions. The link goes to the admin app (`/signout?t=…`) and uses its own token, separate from the member alert token **[builder's call: the most powerful accounts get at least the warning members get]**.
- **Admin sign-in works during maintenance mode**, which today refuses every new verification. Otherwise nobody could sign in to turn maintenance off.

An admin's sign-in makes an **admin session**, which is a different thing from a member session **[builder's call]**:

- It lives in its own table. An admin token never works for member functions, and a member token never works for admin functions.
- It ends 12 hours after sign-in, however active the admin is (v1 spec 5.5).
- Signing in to the admin panel doesn't sign the person in to the website, and the other way around. Admins who are also members (Ali) have both.

### 4.3 The allowlist

- The first admin is added from the command line with an internal Convex function, and only while the allowlist is empty: `bun run convex run admin:bootstrap '{"phone": "+971…"}' --deployment manzilo:wirdak:<env>`. It can't be called from a browser **[builder's call]**.
- After that, admins add and remove admins in the panel. Both are in the audit log.
- The last admin can't be removed **[builder's call]**.
- Removing an admin ends their admin sessions and drops their push subscriptions straight away.

### 4.4 Checks on the server

Every admin query and mutation goes through one wrapper (an `adminQuery` / `adminMutation`, like the existing `sessionQuery`), which resolves the admin session and throws when there isn't a valid one. Hiding a button isn't access control (v1 spec 5.5). Every admin mutation that changes something writes its audit entry in the same transaction.

### 4.5 The audit log

One row per change: which admin, what they did, to what (a khatma, a person, a setting, an admin, a help request), the old and new values, and when. An optional note from the admin goes with the people actions in section 8.

The panel shows the log newest first, filterable by admin and by kind of change. Rows are kept for 2 years **[builder's call]**. Reading the log isn't logged.

What counts as a change: settings, admins, blocks, sign-outs, invite resets, organizer handovers, and closing or reopening a help request. Replies to help requests aren't audit rows, because the conversation is already the record **[builder's call]**.

## 5. The help inbox

- **List:** open requests first, oldest at the top. Then answered, then closed. Each row shows the first line of text, "voice note" and "screenshot" markers, the person's display name (or "زائر" when signed out), the khatma name if any, and how long ago.
- **Conversation:** every message in order, the screenshot (tap for full size), a player for each voice note, and the context from section 3.3. Links open the person's page and the khatma's page (section 8), where the fixes are.
- **Reply** with text **[builder's call: admins reply in text only]**. Sending moves the request to Answered.
- **Close**, with or without a reply. **Reopen** from closed.
- The tab badge and the front page show the number of open requests and how long the oldest has waited.

## 6. Stats

### 6.1 The front page

In this order (Ali approved the brainstorm mockup):

1. **Help requests:** how many are open, and how long the oldest has waited.
2. **Tiles**, each with the change over the last 7 days:
   - Active khatmas: a juz' was finished in the last 14 days **[builder's call: the definition]**.
   - Members: verified people.
   - Ajza' finished today, against the 7-day average.
   - Khatmas completed (rounds completed) this week.
   - **Stalled khatmas** **[builder's call: recommended in the brainstorm when Ali asked for another number; not yet confirmed]**: khatmas whose current round is open, with at least one member, and no juz' finished in 14 days. It's the early sign that a group gave up, and a reason to look at the rounds, not at people.
   - **Days per round** **[builder's call: recommended the same way]**: the median number of days to complete a round, over rounds completed in the last 30 days.
3. **A trend chart** with a switch for 7 days, 30 days, and a year: ajza' finished per day by default, with a picker for new members, new khatmas, and rounds completed.
4. **Sign-in success:** of the WhatsApp verifications started in the last 7 days, the share that ended signed in. A sudden drop means sign-in broke.

Days are counted in the app's default zone, `Asia/Dubai`, like the note text.

### 6.2 Where the numbers come from

- **A daily rollup** **[builder's call]**: a cron just after midnight (Dubai) writes one `dailyStats` row for the day that ended, with that day's counts and the running totals. The trend charts read these rows. Today's numbers are computed live.
- **Verifications are purged after a day** (`convex/maintenance.ts`), so sign-in counts must be taken when they happen (a counter bumped on start and on claim), not reconstructed later.
- **No unbounded scans.** Running totals like "members" are kept as counters that the existing mutations update in the same transaction, or with the Convex Aggregate component. A query must never read every person or every assignment to draw a number. Which of the two is left to the builder.
- **Sliding windows need indexes, not counters.** "Active", "stalled", and "days per round" look back 14 or 30 days, which a running counter can't answer. They read `rounds` through new indexes on `lastFinishedAt` and `completedAt` (section 10), so each reads only the rounds inside its window. "Stalled" is the open current rounds whose `lastFinishedAt` (or `startedAt`, if nothing is finished yet) is older than 14 days.
- **Privacy:** the rollup stores counts only, never person IDs.
- **History at launch** **[builder's call]**: a one-off backfill fills `dailyStats` for past days from the timestamps that already exist (people `verifiedAt`, khatmas `createdAt`, assignments `finishedAt`, rounds `completedAt`). Sign-in success can't be backfilled, so its chart starts on launch day. Milestones the totals have already passed are marked as sent, so launch doesn't fire a burst of old ones.

## 7. Admin notifications

Push to the admin's phone through the admin app. The admin app has its own service worker and subscribes like the website does, with the same VAPID keys as the website on that deployment.

Three kinds:

| Kind | When | Says |
|---|---|---|
| New help request | Right away, at any hour | "طلب مساعدة جديد". Nothing from the request itself. |
| Morning summary | 08:00 Dubai | Yesterday: new khatmas, new members, ajza' finished, khatmas completed, and open help requests |
| Milestone | As soon as the total passes it, at most one push a minute **[builder's call]** | "🎉 وصلنا ١٠٠ ختمة", with the other totals underneath |

- **Lock-screen privacy** **[builder's call]**: a help push never shows the person's words or name, because a phone's lock screen is public.
- **Milestones** **[builder's call]**: khatmas at 10, 50, 100, 250, 500, 1,000, then every 1,000. Members at 100, 500, 1,000, 5,000, 10,000, then every 10,000. Completed khatmas at 1, 10, 100, 1,000, then every 1,000. Each fires once per deployment, ever.
- **Each admin turns each kind on or off** for themselves. All three start on.
- A new message on an open conversation pushes like a new request.
- A push subscription belongs to the admin, not to one admin session, so pushes keep coming after the 12-hour session ends. Tapping one opens the admin app, which asks for a fresh sign-in if needed **[builder's call]**.

## 8. Lookup and operations

From v1 spec 5.5, kept as written:

- **Find a khatma** by invite code or by name. Its page shows the name, schedule, grace, the members (display names, joined date, status), the current round, and the pool: which ajza' are free, taken, or finished in this round. It doesn't show who holds which juz', or for how long **[builder's call: the v1 spec says "pool state"; this is the reading that keeps the anti-goals]**.
- **Find a person** by phone number. Their page shows the display name, the khatmas they're in (and which they organize), their sessions (device and last used), their help requests, and whether the number is blocked.

Actions, each confirmed with a sheet and written to the audit log:

- **Sign out everywhere:** deletes all their member sessions and push subscriptions.
- **Block the number / unblock it.** A blocked number can't finish a WhatsApp verification. It gets the same generic reply as a wrong code. Blocking also signs it out everywhere. Blocking is new: plan 2's block is per khatma, and this one is for the whole app, so it lives in its own table.
- **Reset a khatma's invite link**, reusing the organizer's reset (plan 2).
- **Hand the organizer role to another member**, reusing the organizer handover (plan 2). The new organizer gets the same "you're the organizer now" note as a normal handover.

Admins don't edit people's reading: no taking, finishing, or releasing ajza' for someone **[builder's call]**.

## 9. Live settings

### 9.1 Editing

Every key in `SETTING_DEFAULTS` (`convex/lib/settings.ts`) gets an editor in the panel, grouped as pace and grace, notifications and quiet hours, limits and rate limits, sessions and retention, and switches.

- Each setting shows its current value, its default, and its allowed range, in words an admin understands ("3 days", not `259200000`). A duration is edited as a number plus a unit, like the grace field.
- Each key has a validator in code (type, minimum, maximum), next to its default. The server checks every write against it, so `getSetting` can keep trusting stored values. A bad value is refused, not clamped **[builder's call]**.
- "Reset to default" deletes the row.
- Changes reach every open screen within seconds (Convex queries are live) and are written to the audit log.

New keys plan 3 adds, all editable: the help limits in 3.6, the 14-day auto-close, the summary hour, the milestone push spacing, `announcement`, `maintenanceMode` and its message, and `minClientVersion`.

### 9.2 Announcement banner

`announcement` exists in `SETTING_DEFAULTS` but nothing shows it yet. Plan 3 shows it as a dismissable banner at the top of the website. Dismissing hides that text on that browser; a new text shows again **[builder's call]**. Up to 200 characters, Arabic.

### 9.3 Maintenance mode

The server already refuses actions while `maintenanceMode` is on (`pool.ts`, `khatmas.ts`, `people.ts`, `verification.ts`), and the website already shows a kind message when a refused action comes back (`commonErrors.maintenance` in `apps/web/src/i18n/ar.ts`). What's missing is a warning before someone tries.

Plan 3 adds a banner at the top of every screen while maintenance is on, which can't be dismissed. Its text is editable in the panel, with a default of "نعمل على تحسين وِردك. نعود قريبًا بإذن الله." Pages stay readable (the khatma page, the pool, notes), and help requests still work. Buttons stay where they are, and the existing message answers a tap **[builder's call: a banner, not a full-screen gate and not hiding buttons on every screen]**.

### 9.4 Minimum client version

The website reports its version (the root `package.json` release, as in 3.3). When `minClientVersion` is newer, the website reloads once to pick up the new release. If it's still too old after the reload (a stale cache), it shows "حدّث الصفحة" with a button, and doesn't loop **[builder's call]**.

The version only changes at a release, so on staging, where every push to `main` deploys, `minClientVersion` can't tell two builds of the same release apart. That's accepted: it's a production tool.

### 9.5 Public settings

The website reads `announcement`, `maintenanceMode` and its message, and `minClientVersion` through one public query. No other setting is public **[builder's call]**.

## 10. Data the system needs (sketch, not a schema)

- **helpRequests:** person or reporter token (hash only), khatma (optional), status, context (section 3.3), created, last message, closed.
- **helpMessages:** request, from (person, visitor, or "team"), text, screenshot file, voice file and its length, created.
- **admins:** phone, added by, added at.
- **adminSessions:** admin, token hash, device label, created, expires.
- **adminPushSubscriptions:** admin, endpoint, keys, and which kinds are on.
- **auditLog:** admin, action, target kind and ID, before, after, note, at.
- **blockedPhones:** phone, blocked by, at, note.
- **dailyStats:** day (Dubai), the day's counts, running totals.
- **Counters** or Aggregate component tables for the totals (section 6.2), and the milestones already sent.
- **verifications** gains which app started it (website or admin), and an admin verification points at its `admins` row instead of `existingPersonId`.
- **rounds** gains indexes on `lastFinishedAt` and `completedAt`, for the sliding-window numbers in 6.2.

The help request tables and files follow the retention in 3.6, purged by the existing hourly maintenance job.

## 11. Deploying it

- **Convex:** the same deployment per environment. New env var `ADMIN_SITE_URL` (`https://admin.wirdak.app`, or `https://stg-admin.wirdak.app` on staging). `/api/verification/start` allows it as a second CORS origin, and the WhatsApp reply uses it for admin sign-ins. Everything else in `docs/deploy.md` stays.
- **Vercel:** a second project, `wirdak-admin`, with root directory `apps/admin` and Git deploys off, like `wirdak-web` **[builder's call]**. Its build doesn't run `convex deploy`: the web build already pushed the functions. It gets `VITE_CONVEX_URL` as a Vercel env var per environment.
- **GitHub Actions:** `deploy.yml` deploys the admin app after the website, in the same run, so both ship the same commit.
- **Ali's steps**, as a Linear task when the build starts: create the `wirdak-admin` project and its two domains, set `ADMIN_SITE_URL` on both Convex deployments, and run the bootstrap for his number on staging, then production.
- `docs/deploy.md` gets an admin section, kept up to date with the above.
- **The privacy policy** (`apps/web/public/privacy.html`) gets a short section on help requests: what's collected (text, voice notes, screenshots, and the context in 3.3), who reads it (Wirdak's admins), and how long it's kept (3.6). It ships with the help button, not after.

## 12. Testing

- **Convex:** every admin function refuses a missing, expired, or member token, and a removed admin. Allowlist and bootstrap rules, the always-on 6-digit step, and admin verifications replying with the admin address. Help request limits, states, auto-close, sign-in merging, and retention. Audit rows for every change. The settings validators, including refusing a bad value. Rollup and counters against hand-counted fixtures. Milestones fire once.
- **Website:** the help sheet with and without a screenshot, voice note, and microphone permission. Replies on the home page and in the sheet. The banner, the maintenance screen, and the version reload, including the no-loop case.
- **Admin app:** sign-in, inbox, reply and close, lookup, each action's confirmation, the settings editor, and the audit view.
- **Real devices**, as a Linear task for Ali: a help request from an iPhone with a voice note and screenshot, the reply arriving as a push, and the admin pushes on his phone.

## 13. Builder's calls, in one place

So Ali can check them while reading:

1. Text up to 1,000 characters, voice up to 2 minutes, and a screenshot alone can't be sent (3.2).
2. Screenshots are rendered by the page itself, not a real screenshot (3.2).
3. Only the context in 3.3 is attached.
4. Replies push within the quiet hours, are signed "فريق وِردك", and the person can answer back. Requests auto-close after 14 days (3.4).
5. Signed-out requests are tied to the browser and move to the account on sign-in (3.5).
6. The limits and retention in 3.6.
7. `stg-admin.wirdak.app` for staging, a phone-first layout, and the shared look (4.1).
8. A separate admin session, a command-line bootstrap, and the last admin can't be removed (4.2, 4.3).
9. Audit rows are kept 2 years, and replies aren't audit rows (4.5).
10. Admins reply in text only (5).
11. The definitions of "active" and "stalled", and the daily rollup (6).
12. Help pushes don't show the person's words, and the milestone numbers (7).
13. A khatma's page shows the pool, not who holds which juz' (8).
14. Admins don't edit people's reading (8).
15. Content settings, feature flags, and roles wait (2).
16. A bad setting value is refused, not clamped. Banner and version reload behave as in 9.2 and 9.4.
17. Admin sign-in always ends with the code message, which has no link. Every admin sign-in sends a WhatsApp alert with its own sign-out link. Admin sign-in works during maintenance (4.2).
18. Maintenance mode is a banner that can't be dismissed. Pages stay readable, and the existing message answers a refused tap (9.3).
19. Deleting or correcting a person stays manual and becomes its own follow-up (2).
20. The trend charts are backfilled at launch, and milestones already passed are marked as sent (6.2).
21. Stalled khatmas and days per round are on the front page. I recommended them, and Ali hasn't confirmed them yet (6.1).
22. An admin sign-in never creates a member account. Admin codes go through the staging relay (4.2).
23. Signed-out help requests go through an HTTP endpoint so the per-IP limit can read the IP (3.6).
