# Wirdak (وِردك) plan 2 design: grace period, nudges, push, organizer controls, link previews

- **Date:** 2026-10-28
- **Linear:** [ARQ-245](https://linear.app/manzilo/issue/ARQ-245) (build umbrella), project Wirdak · وِردك
- **Builds on:** `docs/superpowers/specs/2026-10-27-silsila-v1-design.md` (the "v1 spec"; written under the old name Silsila) and what plan 1 shipped (`docs/superpowers/plans/2026-10-27-silsila-v1-core-loop.md`, PR #5)
- **Status:** draft, waiting for Ali's approval

Items marked **[builder's call]** are decisions Claude made while writing this up. Ali didn't decide them and can overturn any of them. Everything else is Ali's, from the plan 2 brainstorm (2026-10-28) or from the v1 spec.

## 1. Intent

Plan 1 shipped the core loop: verify through WhatsApp, take a juz', finish it, and complete the khatma together. What's missing is what keeps a khatma moving when life gets in the way. A reader gets busy, a juz' sits untouched, and the round stalls. Nobody wants to be the person who chases them.

Plan 2 answers that the way Ali put it: **"this is to help, not to shame."**

- A reader gets a fixed amount of time for their juz' (the **grace period**). Before it ends, they get a private note asking whether they need more time. One tap gives them more.
- If the time still runs out, the juz' quietly becomes available to anyone who wants to help. The reader can still finish it. Nobody sees who held it or how long they took.
- Phone notifications carry these notes, plus the existing completion message, so people don't have to open the site to know.
- The organizer gets the tools to fix mistakes (a leaked link, a wrong member), and nothing that lets them manage people's reading.
- An invite link pasted into WhatsApp shows the khatma's name and progress.

## 2. Goals, non-goals, and anti-goals

### Goals

1. **Grace period** per khatma, set by the organizer, which replaces the release rule in v1 spec 3.3 (section 3).
2. **Private pace and gentle nudges**, as in v1 spec section 4, except that pace no longer releases anything (section 4).
3. **Phone notifications** (web push) plus the same messages inside the app, switchable per khatma, silent from 22:00 to 07:00 (section 5).
4. **Organizer controls** from v1 spec 5.4, plus editing the grace period (section 6).
5. **WhatsApp link previews** for invite links (section 7).

### Non-goals (plan 2)

- WhatsApp messages sent by the app (reminders, alerts). They need Meta-approved templates and opt-in consent, so they come later.
- The admin panel. That's plan 3. Plan 2 adds new settings with defaults in code (section 9); plan 3 makes them editable.
- The English UI, the mobile apps, reading the Quran in the app, and AI. These are unchanged from the v1 spec.
- A member leaving a khatma on their own. It isn't in the v1 spec, and "I can't finish it" already lets anyone step back from a juz' **[builder's call]**.
- An offline-capable site. The service worker exists for push only **[builder's call]**.
- Plan 1 follow-ups not listed in 8.3: the flaky `KhatmaPage.actions` test, self-hosted fonts, a CSP, and e2e in CI.

### Anti-goals (unchanged from the v1 spec, and they decide every edge case below)

- **Shaming.** Nobody else ever sees who was slow, who asked for more time, who released a juz', or whose juz' opened for help.
- **Ranking people.** No leaderboard, no "fastest reader", and no per-person reading data shown to the organizer or anyone else.
- **Pressure.** Notes are private, rare, kind, and never sent to the group about one person. No countdowns and no "late" anywhere.
- **Complexity.** If a screen needs explaining to an 80-year-old, it's wrong.

## 3. Grace period

### 3.1 What it is

The grace period is how long a reader holds a juz' before Wirdak checks in with them. The clock starts when they take the juz' **[builder's call: the brainstorm set the lengths per schedule; anchoring the clock to the take time is the reading that fits those lengths and the "no deadline" schedule]**.

The organizer sets it per khatma, when creating the khatma and later in the khatma settings, as a number plus a unit: minutes, hours, or days.

Defaults by schedule (Ali):

| Schedule | Default grace period |
|---|---|
| Daily (يومية) | 6 hours |
| Every 3 days (كل ٣ أيام) | 1 day |
| Weekly (أسبوعية) | 2 days |
| Every 2 weeks (كل أسبوعين) | 4 days |
| Monthly (شهرية) | 7 days |
| No deadline (بدون موعد) | 7 days |

Limits **[builder's call]**: at least 30 minutes, at most 30 days.

The UI calls it "مهلة الجزء" (time for each juz') **[builder's call]**.

### 3.2 The clock pauses at night [builder's call, agreed in the brainstorm]

The grace clock only runs from 07:00 to 22:00 in the reader's time zone. That way the "almost up" note always reaches them awake, and nothing opens for help while they sleep.

- Minutes and hours count waking minutes and hours. A 6-hour grace period started at 20:00 ends at 11:00 the next day: 2 hours tonight, then 4 hours after 07:00.
- One day of grace is one waking day (15 waking hours). A 2-day grace period started on Monday at 10:00 ends on Wednesday at 10:00. That way "days" mean what the organizer expects.
- The reader's time zone is the one stored on their person record when they take the juz'. Section 8.3 keeps it fresh.
- The 22:00 and 07:00 boundaries are the quiet-hours setting (section 9), so they move together.

### 3.3 What happens, step by step

1. **Taking.** The reader takes juz' 12. Its grace period starts. Nothing is shown to anyone about time: no countdown on the tile, the main card, or anywhere else.
2. **"Almost up" note.** When a quarter of the grace period is left (in waking time), the reader gets a private note, by push if they have it on and always inside the app **[builder's call: "a quarter left"; for a daily khatma that's 90 minutes before the end]**:
   > مهلة الجزء ١٢ أوشكت على الانتهاء. هل تحتاج وقتاً أطول؟

   with three buttons: "ما زلت أقرأ" (I'm still reading), "أتممت القراءة" (I finished), and the smaller "لا أستطيع إكماله" (I can't finish it).
3. **"I'm still reading"** adds exactly one more grace period to the current end, whenever they tap it. They see "أعطيناك وقتاً إضافياً. يسّر الله لك". Nobody else is told. They can use it once per juz' they take. After that, the button no longer appears. There's no second "almost up" note.
4. **Time runs out** (after the first grace period if they didn't extend, or after the extension if they did). The juz' **opens for help**:
   - Its tile drops the reader's name and looks exactly like any other open juz' ("متاح"). That's true for members and viewers alike. No countdown, no "late", and no marker that it was held.
   - The organizer gets an alert that names nobody (5.3):
     > الجزء ١٢ متاح لمن يساعد. هل تأخذه أو ترسل الدعوة؟

     with "خذ الجزء" and "أرسل الدعوة". If the organizer is the reader, they get no alert **[builder's call]**.

     The same alert goes out whenever a juz' goes back to the pool for any reason, including "I can't finish it" (3.4). That way the alert never reveals why it opened, even to an organizer who remembers whose name was on the tile (Ali, after review).
   - Any member can take it, from the grid, the suggestion, or the alert.
   - The reader isn't notified at that moment **[builder's call: a push saying "your juz' was opened" adds pressure and changes nothing they can do]**.
5. **The reader can still finish it.** Until someone else takes it, the reader still holds it. Their main card still shows juz' 12 with "أتممت القراءة" and "لا أستطيع إكماله", plus one quiet line: "يمكن لغيرك أن يساعد فيه الآن، ويمكنك إتمامه إن شئت." If they finish, it counts as done, like any finish, and counts toward their pace. "ما زلت أقرأ" isn't offered once the juz' has opened, even if they never used it. Taking it back would put their name back on the tile, which would show everyone that their time ran out **[builder's call]**. To the reader alone, the tile still shows as theirs, so tapping it doesn't offer to take it.
6. **Someone else takes it.** The reader's hold ends, quietly. The reader gets a private thank-you, by push and inside the app:
   > أحدهم يُكمل الجزء ١٢ الآن. جزاكما الله خيراً.

   Their main card goes back to "take a juz'". Their time on it doesn't count toward their pace.

### 3.4 Rules around it

- **"I can't finish it" works as in plan 1** at any point, including after the juz' opened for help. It returns the juz' to the pool, and nobody is told who released it. The organizer gets the same nameless "open for help" alert as for any juz' that goes back to the pool (3.3 step 4). That replaces v1 spec 3.6's "nobody is notified", so the alert gives no reason away (Ali, after review). No thank-you note follows, since the reader chose to step back.
- **One juz' at a time still holds.** A reader whose juz' opened for help is still holding it, so they can't take a second one until they finish it, release it, or someone else takes it **[builder's call]**.
- **Races.** If the reader taps "finished" while someone else takes the juz', whichever reaches the server first wins. If the taker wins, the reader sees the thank-you instead of "تقبّل الله منك". If the reader wins, the taker sees the existing "someone just took it" message and the next suggestion.
- **Undo.** Undoing a finish (plan 1's 10-second window) puts the hold back exactly as it was, including its grace end, whether it was extended, and whether it was open for help.
- **Changing the grace period** applies to ajza' taken after the change. Holds already running keep the grace period they started with, including for their extension **[builder's call: shortening it must never suddenly open someone's juz']**.
- **"No deadline" khatmas use the same rules.** That replaces v1 spec 3.3's 14-day minimum for them.
- **Round target end no longer affects holds.** It still drives the "round is behind" invite (4.3) and the target date shown above the grid.
- **Who released it.** Plan 1 already stores `releasedBySystem` on assignments. When someone takes an open-for-help juz', the old hold is ended with `releasedBySystem: true`. This flag is never shown to anyone.
- **Everything is decided on the server.** Opening for help, extensions, and thank-yous happen in Convex functions, not in the browser, so a future mobile app reuses them (v1 spec 7).

### 3.5 What this replaces

Drop v1 spec 3.3's "Releasing a held juz'" (the keep-or-release question at 3x pace or 24 hours past the target end, plus the 24-hour, 72-hour, and 14-day release timers) and the 3x-pace row of v1 spec 4.2. Their settings never shipped, so there's nothing to migrate.

## 4. Pace and nudges

As in v1 spec section 4, except that pace no longer opens or releases anything.

### 4.1 Pace

Unchanged from v1 spec 4.1:

- Pace is the median of the person's last 5 finished ajza', across all their khatmas, measured from take to finish in ordinary (calendar) time.
- Until they have 3 finishes, their pace is 3 days.
- Finishes under 20 minutes don't count.
- Pace is always kept between 1 and 7 days.

Only the person sees it, on their own screen, phrased positively:

> عادةً تُتمّ الجزء في نحو يومين

It shows on the person's settings page and on their held-juz' card **[builder's call]**. Someone with fewer than 3 finishes sees nothing about pace.

### 4.2 Gentle reminder

When someone has held a juz' for 1.5x their pace, they get one private reminder:

> الجزء ١٢ في انتظارك، يسّر الله لك.

- It's skipped if the "almost up" note for that juz' has already gone out, or would go out on the same day. One message about one juz' a day is enough **[builder's call]**. In practice this means daily khatmas rarely get it, because their grace period is shorter than 1.5 days.
- It's skipped while the juz' is open for help.

### 4.3 "The round is behind" invite

For khatmas with a target end, when the round is behind, members who hold nothing get:

> الختمة تحتاج ٦ أجزاء أخرى قبل الجمعة. هل تأخذ جزءاً؟

- It goes first to the members with the fastest pace, so slower readers aren't pressured (Ali, v1 spec 4.2).
- It never names anyone and never mentions a held or open-for-help juz'.
- It's off for "no deadline" khatmas.
- The builder picks the "behind" formula and how the invite widens to more members. Here are the constraints:
  - Invite only as many of the fastest free members as the shortfall needs.
  - Widen the invite at most once a day.
  - Invite nobody who holds a juz'.
  - Respect the per-person cap below.

### 4.4 Personal numbers

From v1 spec 4.3, visible only to the person, on their settings page:

- how many ajza' they've read in total
- a weekly streak: consecutive weeks with at least one finished juz'

The streak shows only while it's 2 weeks or more. It's never mentioned when it ends: no "you lost your streak" **[builder's call]**. The group numbers from v1 spec 4.3 (khatmas completed together, and the current round's progress) already exist from plan 1.

### 4.5 Limits

- At most one nudge (the reminder in 4.2 or the invite in 4.3) per person per khatma per day.
- The "almost up" note, the thank-you, the organizer alert, and the completion message aren't nudges. They don't count toward the cap and aren't limited by it.
- Quiet hours apply to every push (5.2).

## 5. Notifications

### 5.1 Two channels, one message

Every message in this plan reaches the person in two ways:

- **Inside the app**, always. A note shows as a card at the top of that khatma's page, and the khatma's card on the home page gets a small dot.
  - A note stays until the person acts on it or dismisses it.
  - Notes that no longer apply clear themselves. For example, "almost up" clears after a finish, and the organizer alert clears once the juz' is taken or done.
  - There's no separate inbox screen **[builder's call]**.
- **By push**, when the person has turned push on in this browser and hasn't switched this khatma off. Tapping the push opens the khatma page.

### 5.2 Push

- **Web Push with VAPID keys.** The site ships a service worker for push and for opening the right page on tap. The VAPID keys live in Convex environment variables and are listed in `docs/deploy.md`.
- **Asking for permission.** Wirdak asks after the person takes their first juz', never on first visit, with one plain sentence about why first:
  > نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً.

  If they decline, Wirdak doesn't ask again on its own. They can turn push on later from their settings page.
- **iPhone.** Push works only after the site is added to the home screen, on iOS 16.4 or later (v1 spec 6). After an iPhone user's first take, show simple illustrated steps for that instead of the permission prompt. This needs real app icons (8.3), and it needs the sign-in carried over to the home-screen app (5.4).
- **Per khatma.** One switch on the khatma page, "إشعارات هذه الختمة". It's on by default and stored on the membership.
  - Off stops all pushes from that khatma, including "almost up".
  - In-app notes still appear. The reader just won't be called back to the app, and the grace rules still run **[builder's call: one switch is simpler than separate switches for nudges and alerts]**.
  - This replaces plan 1's unused `nudgesOn` field.
- **Quiet hours: 22:00 to 07:00 in the person's time zone.** Nothing is pushed in that window. In-app notes still appear right away; only the push waits. Anything due then waits until 07:00, and it's dropped if it no longer applies by then (for example, the juz' was already taken). Thanks to the night pause in 3.2, "almost up" never falls in quiet hours anyway.
- **One subscription per browser.** It's tied to the person and the session. Signing out of a device deletes that device's subscription. Subscriptions that the push service reports as gone (HTTP 404 or 410) are deleted.
- **What a push may contain.** It's the same text as the in-app note, which already names nobody except the person themselves. It never includes a phone number.

### 5.3 The messages

| When | Who gets it | Message (gist; exact Arabic is the builder's within this tone) | Counts as a nudge |
|---|---|---|---|
| A quarter of the grace period left | The reader | "Juz' 12's time is almost up. Need more time?" (3.3) | No |
| A juz' went back to the pool: its time ran out, or its reader tapped "I can't finish it" (not when the organizer removed its reader) | The organizer, unless they're the reader | "Juz' 12 is open for help. Take it or share the invite?" The wording is the same whatever the reason. | No |
| Someone else took the reader's open-for-help juz' | The original reader | "Someone is completing juz' 12. May Allah reward you both." | No |
| Held for 1.5x their pace | The reader | "Juz' 12 is waiting for you, may Allah make it easy." | Yes |
| The round is behind | The fastest free members first | "The khatma needs 6 more ajza' by Friday. Take one?" | Yes |
| The round is completed | Every member | "ختمنا القرآن معاً، الحمد لله" (v1 spec 3.8; fills plan 1's `onRoundCompleted` hook) | No |
| Organizer role handed to you | The new organizer | "You now organize this khatma." | No |
| Organizer role moved after 30 days away | The old organizer | A private, kind note (6.3) | No |

**Batching [builder's call]:** if more than one juz' in a khatma goes back to the pool within the same hour, the organizer gets one alert listing them ("الأجزاء ١٢ و١٥ متاحة لمن يساعد").

### 5.4 Carrying the sign-in to the iPhone home-screen app (Ali, after review)

iOS gives a site added to the home screen its own storage, separate from Safari. The session token lives in `localStorage`, so without help the home-screen app opens signed out. The person would then have to verify again, and an existing number needs the 6-digit WhatsApp code. That's too much for the 80-year-old this app is for, and push only works inside the home-screen app. So Wirdak carries the sign-in over:

1. Just before showing the "add to home screen" steps, the signed-in Safari page asks the server for a **hand-off token**. It's random (generated in an action, like every other secret), stored only as a hash, tied to the current person and session, single use, and valid for 30 minutes.
2. The address the home-screen app opens on first launch carries that token, for example `/handoff?t=…`. The builder confirms on a real iPhone which way iOS picks the launch address: from the manifest's `start_url` (which then needs a per-person manifest) or from the page that was open. The builder picks whichever works and documents it.
3. On first launch, the home-screen app trades the token for a **new session** for the same person. The device shows in the signed-in devices list as "iPhone · الشاشة الرئيسية". The token is then used up, and the app removes it from the address bar. Then the app asks for push permission (5.2).
4. **Fallbacks:**
   - A used or expired token on a later launch does nothing if the app already has a session.
   - Without a session, the person verifies through WhatsApp as usual, and the push prompt follows sign-in.
   - Android and desktop don't need any of this.
5. **No WhatsApp "new sign-in" alert for a hand-off** **[builder's call]**. The token can only come from a session already signed in on the same phone, seconds earlier, and an alert there would only confuse the person. The new session still shows in the devices list, and "sign out all other devices" still covers it.
6. **Security:**
   - The token never appears in logs.
   - The site already sends `Referrer-Policy: no-referrer`.
   - The exchange is rate-limited.
   - Signing out the session that created the token also invalidates the token.

## 6. Organizer controls

The v1 spec says "creator". From plan 2 on, the UI and this doc say **organizer** (منظّم الختمة) **[builder's call]**, since the role can be handed to someone else. Whether to rename `creatorPersonId` in the schema is up to the builder.

### 6.1 Where

A "إعدادات الختمة" (khatma settings) link on the khatma page, shown only to the organizer. Members don't see the settings screen.

### 6.2 What the organizer can do

From v1 spec 5.4, plus the grace period:

- **Rename the khatma and change its schedule.** Changes apply from the next round (v1 spec 5.4). Changing the schedule doesn't change the grace period, but the settings screen shows the default for the new schedule next to the current value **[builder's call]**. (Ali's plan 2 list didn't name these two, but v1 spec 5.4 includes them and plan 1 deferred all creator powers to plan 2.)
- **Edit the grace period:** a number plus a unit, within the limits in 3.1, with a one-line explanation:
  > إن احتاج القارئ وقتاً أطول يستطيع طلبه مرة واحدة، وبعدها يمكن لغيره أن يساعد.
- **Reset the invite link** if it leaks. It gets a new invite code, and every member's personal sharing token is replaced, so all old links stop working. They show plan 1's "this link no longer works" page. The confirmation tells the organizer to share the new link with the group.
- **Remove a member:**
  - Their held juz', if any, returns to the pool, with no thank-you or other message about the juz'. The organizer gets no "open for help" alert for it, since they did it themselves.
  - Their phone number is blocked from rejoining this khatma until the organizer unblocks it.
  - The member list shows names only: no phone numbers, no reading data, no pace, no order by activity. It's sorted by join date.
  - A removed person who opens the khatma sees plan 1's blocked state, and the khatma drops off their home page.
  - The organizer can't remove themselves. They hand over the role first.
- **Unblock** someone from a "blocked" list in the same screen.
- **Hand the organizer role** to another active member. The new organizer gets a private note. The old one becomes an ordinary member.

The organizer still can't assign ajza', take or finish them for others, see anyone's pace, or see who held an open-for-help juz'.

### 6.3 Automatic handover

From v1 spec 5.4: if the organizer hasn't opened the app for 30 days, the role passes to the member who joined the khatma earliest and has opened the app in the last 7 days. The old organizer is told privately ("we passed the khatma's organization to keep it running; you're still a member") **[builder's call: the wording]**.

- A daily job checks for this.
- If no member qualifies, nothing changes, and the job checks again the next day.
- "Opened the app" means activity recorded by the touch in 8.3, not only taking or finishing ajza'.

## 7. WhatsApp link previews

When an invite link (`/j/<code>?from=<token>`) is pasted into WhatsApp, the chat shows a preview card:

- **Title:** the khatma's name, or its dated label as in plan 1, then "· وِردك".
- **Description:** progress, "تمّ ١٨ من ٣٠ جزءاً · الختمة ٤", plus "دعاك أحمد" when `from` is a valid sharing token of an active member (v1 spec 3.4).
- **Image:** one fixed Wirdak image (1200x630) with the misbaha ring motif **[builder's call: a per-khatma progress image can come later]**.
- **Unknown, reset, or malformed codes** get a generic Wirdak preview and never an error.

How it works (v1 spec 3.4):

- A small server function on Vercel handles `/j/*`. It returns the normal `index.html` with the Open Graph tags filled in, so people and crawlers get the same page and the SPA keeps working.
- It reads only those fields from a new rate-limited Convex HTTP endpoint that answers only for a valid invite code. The Vercel function passes on the visitor's IP with a shared secret, so the limit applies per visitor and not to Vercel as a whole **[builder's call]**. The endpoint returns the name, done count, round number, and the inviter's display name for a valid code and token pair, and nothing else.
- WhatsApp caches previews, so a stale progress count is acceptable.

The builder picks between Vercel Edge Middleware and a serverless function, and sets the cache headers.

## 8. Experience and plumbing

### 8.1 Creating a khatma

The create screen gets one more line under the schedule choice:

> مهلة كل جزء: يومان · تغيير

Tapping "تغيير" (change) reveals a number field and a unit choice (minutes, hours, days). The value follows the schedule's default until the creator edits it. This keeps the screen one main question for anyone who doesn't care **[builder's call]**.

### 8.2 Text and layout

Everything from v1 spec 5.1 and 5.3 applies to every new screen:

- Arabic strings live in `ar.ts`.
- Use logical CSS properties.
- Show numbers in Eastern Arabic digits.
- Keep 56px buttons with text labels.
- No hidden menus.

The night pause and grace lengths are never shown as a countdown.

### 8.3 Plan 1 follow-ups pulled into plan 2 [builder's call]

These follow-ups are needed for plan 2 to work:

- **Refresh activity on page views (M8).** The app sends one cheap, rate-limited "touch" (at most once an hour per session) when it opens. The touch:
  - updates the session's `lastUsedAt` and the person's last-seen time, which automatic handover (6.3) needs
  - updates the person's time zone if the browser reports a different one, which the night pause (3.2) and quiet hours need
- **Manifest icons.** iPhone push needs the site added to the home screen, and that needs proper icons. The builder makes simple ones from the prototype's misbaha ring and green palette, plus an `apple-touch-icon`. Ali can replace them later.

### 8.4 Time and scheduling

- **Exact times.** Grace ends, "almost up" moments, and pushes delayed by quiet hours are computed on the server in the reader's time zone, and fired with Convex scheduled functions at exact times. Every scheduled job checks the current state first and does nothing if it no longer applies (finished, released, taken, or extended), so cancelled or duplicated jobs are harmless.
- **Periodic checks.** The behind check, pace reminders, and automatic handover can run on crons instead. The builder picks the split.
- **Time-zone code.** Time-zone math must handle daylight saving changes and time zones with half-hour offsets, and be tested with at least `Asia/Dubai`, `Europe/London` across a daylight-saving change, and `Asia/Kolkata`.

## 9. Settings added (defaults in code, editable in plan 3's admin panel)

Following plan 1's `SETTING_DEFAULTS` pattern **[builder's call: names and exact shapes]**:

- Grace defaults per schedule (3.1), grace minimum (30 minutes) and maximum (30 days).
- "Almost up" point: a quarter of the grace period left.
- Quiet hours: 22:00 to 07:00. These also bound the night pause.
- Pace: default (3 days), bounds (1 to 7 days), minimum counted finish (20 minutes), sample size (last 5), finishes needed before pace shows (3).
- Gentle reminder threshold (1.5x pace). Nudge cap (1 per person per khatma per day).
- Organizer inactivity (30 days). Successor must have been active within (7 days).
- Rate limits for the link-preview endpoint and the touch.

## 10. Data the system needs (sketch, not a schema)

Additions to plan 1's schema; the builder owns the real one.

- **Khatma:** grace period (value and unit as the organizer chose them).
- **Member:** notifications on or off for this khatma (replaces `nudgesOn`). Plan 1's `status: "blocked"` already covers removal.
- **Person:** last seen at. The time zone already exists.
- **Assignment:** the grace period it started with, grace end (waking time already converted to an exact time), whether it was extended, when it opened for help (or null). The existing `releasedBySystem` is set when someone takes over an open-for-help juz'.
- **Push subscription:** person, session, endpoint, keys, created at.
- **Hand-off token:** token hash, person, the session that created it, created at, expires at, used at.
- **Note (in-app message):** person, khatma, kind, juz' numbers if any, created at, due at (for quiet hours), dismissed or cleared at.
- **Nudge log** (or a field on the member): last nudge time, for the daily cap.

Production isn't deployed yet (ARQ-254), so schema changes need no data migration beyond the local dev backend.

## 11. Privacy and safety

- **Organizer view.** The organizer sees member names and the blocked list. They never see phone numbers, pace, reading history, or who held a juz' that opened for help.
- **What's stored.** Push subscriptions are tied to a person and a session, and deleted with the session. Notes are kept for 30 days, then purged by the existing maintenance cron **[builder's call]**.
- **Link preview.** The endpoint exposes only what a person holding the invite link could already see on the page: name, progress, and inviter. It's rate-limited per IP.
- **Server-side checks.** Every organizer action checks the organizer role on the server. Hiding a button isn't access control (v1 spec 5.5).
- **Nothing new is shown.** Plan 2 adds no third-party analytics and no new personal data on screen.

## 12. Cases the builder must test

1. A 6-hour grace period taken at 21:30 Dubai time ends at 12:30 the next day, and its "almost up" note fires at 11:00. Nothing fires between 22:00 and 07:00.
2. A 2-day grace period taken on Monday at 10:00 ends on Wednesday at 10:00.
3. "I'm still reading" twice: the second tap changes nothing. After the extension runs out, the juz' opens for help with no second note.
4. A juz' that opened for help shows as "متاح" with no name to a member, to a viewer, and to the organizer. The view gives no field that tells it apart from a released juz'.
5. The original reader finishes after it opened for help: it counts as done, and round completion works as in plan 1.
6. Someone else takes it: the original reader's hold ends, they get exactly one thank-you, and their pace doesn't change.
7. The reader finishes and someone else takes it in the same instant: exactly one wins, and each side sees the matching message.
8. Undo a finish of an open-for-help juz': it goes back to open for help, not to a fresh grace period.
9. The organizer shortens the grace period: holds already running keep their old end.
10. With push off for a khatma, no push is sent, the in-app note still appears, and the juz' still opens on time.
11. A completion that falls in someone's quiet hours reaches them at 07:00.
12. Organizer inactive for 30 days, with three members who were active recently: the earliest joiner gets the role, and both people get their private notes. With no active member, nothing changes.
13. After an invite reset, old invite links and old sharing tokens show "this link no longer works", and the link preview for them is generic.
14. A removed member's held juz' is open, they can't rejoin, and they can after being unblocked.
15. The member list and every organizer query return no phone numbers and no reading data.
16. "I can't finish it" and a timed-out juz' produce the same organizer alert, word for word.
17. A hand-off token works once, fails after 30 minutes, fails after the session that created it signs out, and never creates a session for anyone other than its person.

## 13. Left to the builder

- The exact Arabic wording, within the gists and tone above.
- The web-push library, the service worker setup, and how the in-app note cards look.
- The scheduling split between scheduled functions and crons (8.4).
- The "behind" formula and how the invite widens (4.3).
- Vercel middleware versus a function for previews, and the cache headers (7).
- Schema names and shapes (10).
- Whether to rename `creatorPersonId` (6).

## 14. Decisions Ali made after review (2026-10-28)

1. The organizer's "open for help" alert goes out for every juz' that goes back to the pool, including "I can't finish it", so the alert never reveals why (3.3, 3.4, 5.3).
2. The sign-in is carried over to the iPhone home-screen app with a single-use hand-off token, instead of asking people to verify again (5.4).
