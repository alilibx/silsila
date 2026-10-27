# Silsila (سلسلة) v1 design

- **Date:** 2026-10-27
- **Linear:** [ARQ-244](https://linear.app/manzilo/issue/ARQ-244/write-v1-design-document-for-silsila), project [Silsila · سلسلة](https://linear.app/manzilo/project/silsila-slslh-cf8ea87ffcd8)
- **Status:** draft, waiting for Ali's approval

Items marked **[builder's call]** are decisions Claude made during design. Ali didn't decide them and can overturn any of them. Everything else comes from Ali.

## 1. Intent

Families, friends, and colleagues run group Quran khatmas today in WhatsApp groups. Someone posts a numbered list of the 30 ajza', people reply with their names, and one person ends up chasing everyone. Nobody can tell who finished what. People who didn't finish their juz' are too embarrassed to say so, and the khatma stalls quietly.

Silsila replaces that list. It's a group khatma that runs itself. Anyone starts one and invites the people they love. Each person takes one juz' at a time, reads it, and marks it done. When all 30 are done, the group completes the khatma together, and the next round starts on its schedule.

The name means "chain": each reader passes the next juz' along.

### Who it's for

Anyone in a family, friend, or work group. It must work for a 10-year-old and an 80-year-old with no help. Arabic is the main language, and English comes second.

### What success looks like

- A family of about 10 completes a weekly khatma without anyone posting a list on WhatsApp.
- An 80-year-old taps an invite link and takes a juz' in under a minute, without help.
- Nobody acts as the group's manager after it's created.

## 2. Goals, non-goals, and anti-goals

### Goals (v1)

1. Create a khatma with a name or a date, and a repeating schedule.
2. Invite people with a link that opens the website instantly, with no app store and no password. Anyone with the link can view; taking a juz' requires a phone number verified through WhatsApp.
3. Share a pool of 30 ajza'. Each person holds one juz' at a time and takes another after finishing.
4. Rotate ajza', so people get offered ones they haven't read recently.
5. Show everyone the state of the pool: open, being read (and by whom), and done.
6. Learn each person's reading pace and nudge them privately and gently.
7. Celebrate each completed khatma as a group, with the khatm dua.
8. Ship a fast, mobile-first website and an admin panel. Send reminders as browser push notifications, and offer WhatsApp share buttons.
9. Let Ali change app settings remotely from the admin panel, with changes reaching every open screen within seconds (5.5).

### Non-goals (v1)

- The English UI. It comes in a follow-up release; v1 is Arabic only.
- Dedicating a khatma, such as "على روح جدّي". It can come later as one optional field **[builder's call]**.
- Reading or listening to the Quran inside the app. That comes later.
- WhatsApp Business API reminders. That's v2.
- AI assistance. That comes later.
- iPhone and Android apps. Ali will decide the mobile technology after v1 (Expo or Flutter); see 7.
- Passwords or email sign-in. Identity is a phone number verified through WhatsApp (5.2).
- SMS verification. It's a fallback after v1.
- Group chat. The group's WhatsApp group already does that.
- Public discovery of khatmas. All khatmas are invite-only.
- Payments or ads.

### Anti-goals (failure even if it works)

- **Shaming.** Nobody ever sees who is slow, who released a juz', or who missed a round.
- **Ranking people.** No leaderboard of individuals, and no "top reader". Showing off worship (riya') is the risk scholars raise about group khatmas and gamification.
- **Pressure.** Reminders are gentle, rare, and never sent to the group about one person.
- **Complexity.** If a screen needs explaining to an 80-year-old, it's wrong.

## 3. How a khatma works

### 3.1 Words used in this document

| Term | Meaning |
|---|---|
| Khatma (ختمة) | A group, plus its schedule and its repeating rounds. Shown in the UI as the group. |
| Round (دورة) | One pass through all 30 ajza'. Round 1, round 2, and so on. |
| Juz' (جزء), ajza' (أجزاء) | One of the 30 standard parts of the Quran. The only unit of work in v1. |
| Member | Someone who opened the khatma's link **and verified their phone number** (3.4). Viewers who never verify aren't members. |
| Viewer | Anyone with the link who hasn't verified. Can look, can't act. |
| Creator | The member who created the khatma. |

### 3.2 Creating a khatma

Creating a khatma requires a verified phone number (5.2), like taking a juz'. The creator answers two questions on one screen:

1. **Name (optional).** If left empty, the khatma is labeled with its start date, such as "ختمة ٢٧ أكتوبر".
2. **How often?** One of these options:
   - يومية (daily)
   - كل ٣ أيام (every 3 days)
   - أسبوعية (weekly)
   - كل أسبوعين (every 2 weeks)
   - شهرية (monthly)
   - بدون موعد (no deadline: the group reads at its own pace)

   Yearly isn't offered. The option list is **[builder's call]**; Ali said "daily or weekly or whatever, not yearly".

   The schedule sets each round's target, not a calendar slot. "Weekly" means "aim to finish each round within a week" (see 3.3).

After creating it, the creator lands on the khatma screen with a large "invite" button.

### 3.3 Round timing

- Round 1 starts when the khatma is created. Each round has a target end: its start time plus the period.
- When the 30th juz' is marked done, the group sees the celebration, and the next round starts right away, with a fresh target end. A fast group finishes more khatmas. Ali decided this.
- If the target end passes with ajza' still unread, the round stays open until all 30 are done. Rounds never overlap, so the next round starts only when this one completes.
- Passing the target end doesn't take anyone's juz' away by itself. See "Releasing a held juz'" below.
- **"No deadline" has no target end.** For that schedule, the "round is behind" nudge, the target end above the grid, and the deadline line in "remind the group" are off. The pace nudges and the release rule below still apply, so one abandoned juz' can't stall the khatma forever **[builder's call]**.

#### Releasing a held juz' **[builder's call]**

The goal: nobody loses a juz' they're actively reading, and no abandoned juz' blocks a round forever. Earlier drafts released everything at the target end, which breaks daily khatmas.

1. **The keep-or-release question** ("keep juz' 12, or let someone else help?") is raised at the earlier of:
   - the person has held the juz' for 3x their pace (4.1), or
   - the round is past its target end and the person has held the juz' for at least 24 hours. This keeps daily and 3-day khatmas moving.

   The question always appears inside the app the next time they open it. It's also sent as a push notification if they have push on, respecting quiet hours. Turning nudges off stops the reminders in 4.2 but not this question, because it protects the group.
2. **"Keep"** restarts the clock. The question comes back after another 1x their pace, or after another 24 hours if the round is past its target end, whichever is sooner. There's no limit on how many times someone can answer "keep"; they're still reading.
3. **Automatic release** happens when the question goes unanswered for either:
   - 24 hours after the app reports that the question was shown on screen, or
   - 72 hours after the question was raised, whether or not it was seen.

   Push providers don't confirm that a notification was seen, so a sent push never starts the 24-hour timer. Only the app reporting the question on screen does. For khatmas with a deadline, automatic release also requires the round to be past its target end. For "no deadline" khatmas, it also requires the juz' to have been held for at least 14 days.
4. **After release**, the person gets a private, kind message the next time they open the app: "We opened juz' 12 so others can help. You can take it back anytime." Nobody else is told who held it.

### 3.4 Joining and verifying

- Any member can share the invite link. The share button opens WhatsApp with a ready-made Arabic message.
- Tapping the link opens the khatma on the website straight away, with no app store in the way. Each member's share button builds their own link: the khatma invite code plus that member's random sharing token of at least 10 characters, for example `silsila.app/j/fam38Qx?from=Hq7cT2mZ9w`. Tokens are unguessable, so nobody can list members by trying values. The page shows "دعاك أحمد إلى ختمة العائلة" at the top.
- **WhatsApp link preview:** a small server function on the web host answers `/j/...` requests with Open Graph tags, so the WhatsApp chat itself shows the khatma name and inviter under the link. It reads only those two fields from a rate-limited Convex HTTP endpoint, which answers only for a valid code and token pair **[builder's call]**.
- Anyone with the link can see the khatma and its pool with no name, number, or verification. Reader names on tiles are shown only to members (see below); viewers see "يُقرأ" without names **[builder's call]**.
- **Taking a juz' requires a verified phone number.** Ali decided this. The first time someone taps "take a juz'", one sheet asks for their name and offers one button: "تحقّق عبر واتساب" (verify with WhatsApp). See 5.2 for how it works.
- A person becomes a member of a khatma the first time they take a juz' in it, or when they create it. Someone already verified through another khatma doesn't verify again; they become a member here when they take their first juz' here. Viewers, verified or not, aren't members, don't count toward the 60-member cap, and don't get this khatma's notifications **[builder's call]**.
- No password or email.
- Members per khatma are capped at 60 **[builder's call]**, to limit abuse of a leaked link.

### 3.5 Taking a juz'

- The main button on the khatma screen is "take a juz'" (خذ جزءاً). It suggests one juz', and the person confirms with one tap.
- **Rotation rule:** suggest the lowest-numbered open juz' that this person hasn't read in their last 3 rounds in this khatma. If every open juz' was read recently, suggest the lowest-numbered open one. The look-back of 3 rounds is **[builder's call]**.
- Below the button, the person can open the grid of 30 and pick a specific open juz' instead.
- A person holds at most one juz' at a time in each khatma.
- If two people take the same juz' at the same moment, the first one gets it. The second sees "someone just took it" and gets the next suggestion.

### 3.6 Finishing or releasing

While holding a juz', the main screen shows it in large text with two buttons:

- **"I finished" (أتممت القراءة).** The juz' turns done. The person sees "تقبّل الله منك" and an offer to take another juz' if any are open. An undo option stays visible for 10 seconds. Completion (3.8) fires only once all 30 ajza' are done and 10 seconds have passed since the most recent "I finished" in the round. Every member's undo window closes within 10 seconds of their own tap, and the most recent tap is the last to close, so no undo can ever reopen an announced round. Any undo before that point cancels the pending completion **[builder's call]**.
- **"I can't finish it" (لا أستطيع إكماله)**, the smaller of the two. The juz' returns to the pool. Nobody is notified, and nobody sees who released it.

### 3.7 The pool view

A grid of 30 tiles, one per juz'. Each tile shows the juz' number and its name, taken from the opening words of the juz' in the mushaf, such as "عمّ" for 30, "تبارك" for 29, and "قد سمع" for 28. Using the opening words avoids regional naming differences **[builder's call]**. Each tile has one of three states, shown with color plus a word, never color alone:

- **Open (متاح):** anyone can take it.
- **Being read (يُقرأ):** shows the reader's name to members, because Ali's pain point was not knowing who has what. The name stays until the juz' is done or released. It's never hidden for being late, and tiles never show how long someone has held a juz', so nothing on the tile signals who is slow. The release rule (3.3) keeps any name from sitting on a tile for long. Ali decided this after review showed that hiding an overdue name tells everyone that person is late.
- **Done (تمّ):** shows no name, so nobody can count who finished the most. Ali decided this.

Above the grid: "١٨ من ٣٠ تمّت" with a progress bar, and the round's target end.

### 3.8 Completing a khatma

When the 30th juz' is marked done:

- Every member sees a celebration screen the next time they open the app: the round number, the number of people who took part, and a khatm dua made only of Quranic duas, such as «رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنتَ السَّمِيعُ العَلِيمُ» (2:127). Ali decided on Quranic duas only, because the popular long khatm dua has a disputed attribution. The builder picks the verses and must copy them exactly, with diacritics, from a verified mushaf text source.
- A push notification goes to all members who enabled notifications: "ختمنا القرآن معاً، الحمد لله". Quiet hours (4.2) apply: a member in their quiet hours gets it at 07:00 their time.
- A WhatsApp share button posts "we completed khatma number 12 together" to the family group.
- The round's history is kept, so the group sees "12 khatmas completed together".

## 4. Pace, nudges, and encouragement

### 4.1 Pace

- The app records how long each person takes from taking a juz' to marking it done.
- A person's pace is the median of their last 5 finished ajza' across all their khatmas. Until they have 3 finished ajza', the default pace is 3 days. Finishes in under 20 minutes don't count toward pace, because they're likely mistaken taps or ajza' already read. Pace is always kept between 1 and 7 days, so nudges never fire within hours and never wait weeks **[builder's call]**.
- Pace is private. Only that person can see it, on their own screen, phrased positively: "you usually finish a juz' in about 2 days".

### 4.2 Nudges (all private, to one person)

| When | Message (gist) |
|---|---|
| Holding a juz' for 1.5x their pace | Gentle reminder: "Juz' 12 is waiting for you, may Allah make it easy." |
| Holding a juz' for 3x their pace | Asks: "Would you like to keep juz' 12 or let someone else help?" with keep and release buttons. |
| The round is behind and this person holds nothing | "The khatma needs 6 more ajza' by Friday. Would you like to take one?" Sent first to members whose pace is fastest, so slower readers aren't pressured. |
| The round is completed | Celebration (see 3.8). |

Limits **[builder's call]**:

- At most one nudge per person per khatma per day.
- No push notifications of any kind between 22:00 and 07:00 in the person's time zone, including the completion push. Anything due in that window is delivered at 07:00. The one-per-day cap covers nudges only, not the completion push or the keep-or-release question.
- Each person can turn off nudges for a khatma.

"Behind" means the number of open ajza' is more than the expected pace of the members who hold nothing can cover before the target end. The builder picks the exact formula.

### 4.3 Gamification without ranking

- **Group:** total khatmas completed together, and the current round's progress. These are visible to all members.
- **Personal:** ajza' read and a weekly streak. These are visible only to the person.
- No leaderboard, no badges comparing people, and no "fastest reader".

## 5. Experience requirements

### 5.1 Language and layout

- v1 ships in Arabic only, right-to-left. Ali decided this.
- All UI text lives in translation files from day one, with no hard-coded strings, so adding English later is mostly a translation job. Use direction-neutral CSS (logical properties such as `margin-inline-start`, and Tailwind's `ms-`/`me-`/`ps-`/`pe-` utilities rather than left/right), so the layout flips correctly when English arrives.
- Numbers in the Arabic UI use Eastern Arabic digits (١٢٣) **[builder's call]**.
- Dates use the Gregorian calendar in v1. Hijri dates can come later **[builder's call]**.

### 5.2 Identity: phone number verified through WhatsApp

A person's identity is their phone number, verified through WhatsApp. Ali decided that phone numbers are collected and verified, and that verification gates taking a juz'. The method below is **[builder's call]**, chosen because older users struggle to type codes from SMS.

**How verification works ("reverse" verification):**

1. The person taps "تحقّق عبر واتساب". The app creates a pending verification with a random one-time code, tied to this app or browser session. The code is at least 10 characters from a 32-character alphabet, unique among all pending verifications, used once, and expires after 10 minutes. The person never types it, so length costs nothing.
2. The app opens `wa.me/<Silsila's WhatsApp number>?text=...` with a ready-made message such as "رمز التحقق في سلسلة: K7Q2-9XMB-4T".
3. The person taps send in WhatsApp. They never type their number or copy a code.
4. Silsila's WhatsApp Business Cloud API webhook receives the message. WhatsApp supplies the sender's phone number. The backend matches the code, saves the number in E.164 format, and marks the person verified.
5. The app watches the verification live and continues automatically: "تمّ التحقق" and the take-a-juz' sheet. Silsila also replies in WhatsApp with "تمّ التحقق، ارجع إلى سلسلة" and a link back. Replies within 24 hours of a user's message don't need an approved template.
6. The app shows the masked number to the person ("‎+971 50 ••• 1234، هذا رقمك؟") with a "not me" option. This catches an honest mistake, such as a family member sending the message from their own phone.

**Protection against account takeover [builder's call]:** a scammer could start a verification on their own phone, then forward the WhatsApp link to a victim ("tap to join our khatma"). If the victim sends it, the scammer's session would be tied to the victim's number. The "not me" check doesn't stop this, because the scammer sees it, not the victim. So:

- **New number (no Silsila account yet):** one-tap verification as above. The scammer gains only an empty account, with none of the victim's history.
- **Number that already has an account:** after the message arrives, Silsila replies in the same WhatsApp chat with a 6-digit code, and the app asks for it. Only the real owner sees that reply, so a forwarded link is useless. This costs existing users one extra step only when they sign in on a new device.
- Every new sign-in triggers a WhatsApp reply to the number: "New sign-in to Silsila on [device type]. If this wasn't you, tap here." The link signs out every other session.
- The app's settings show the person's signed-in devices with "sign out all other devices".
- Verify the webhook signature on every request. Rate-limit verification attempts per session, per sending number, and per IP address.

**Rules:**

- After verification, the backend issues a session token that the website stores in an HttpOnly, Secure cookie or, if the hosting setup makes that impractical, in browser storage, so the person stays signed in. The builder picks and documents which.
- On a new phone or browser, the person verifies again with the same number, and their khatmas and history come back. This replaces the "return link" from the earlier draft.
- One person can be in many khatmas. The home screen lists them.
- People without WhatsApp can view khatmas but can't take a juz' in v1. An SMS code fallback comes after v1 **[builder's call]**. SMS costs money for every code, and the UAE requires registering a sender name.
- Consent for WhatsApp reminders is a separate, explicit question in v2. Verifying doesn't subscribe anyone to messages **[builder's call]**.

### 5.3 Usable at 10 and at 80

- Base text size at least 18px, main buttons at least 56px tall, and full-width on phones.
- One main action per screen. Secondary actions are smaller and lower.
- Every icon has a text label. No swipe gestures, long-press, or hidden menus.
- High contrast that meets WCAG AA at minimum.
- Respects the phone's text-size setting.
- Readable Arabic UI font, such as IBM Plex Sans Arabic **[builder's call]**.
- Plain words. Use "خذ جزءاً", not "احجز" or "سجّل".

### 5.4 Creator's limited powers

The creator isn't a manager, but someone must handle mistakes. The creator can:

- Rename the khatma and change its schedule. Changes apply from the next round.
- Remove a member. Their held juz' returns to the pool, and their phone number is blocked from rejoining this khatma until the creator unblocks it.
- Reset the invite link if it leaks. Old links, including members' personal sharing links, stop working.
- Hand the creator role to another member.

Nothing else. The creator can't assign ajza' or mark ajza' done for others.

If the creator hasn't opened the app for 30 days, the creator role passes automatically to the member who has been in the khatma longest and opened the app in the last 7 days, and the old creator is told privately. That way a lost phone can't leave a khatma without anyone to fix a leaked link **[builder's call]**.

### 5.5 Admin panel and remote settings

Ali decided that the app needs a web admin page for managing it remotely. Everything below is **[builder's call]** unless marked.

**Settings (stored in a Convex settings table, applied live):**

The website subscribes to the settings, so a change in the admin panel reaches every open screen within seconds, with no new release. Each setting has a default in code, so the site works if the table is empty.

- Pace and release: default pace, pace bounds (1 to 7 days), the 1.5x and 3x nudge thresholds, release timers (24h, 72h, 14 days), and the rotation look-back (3 rounds).
- Notifications: quiet hours, and the one-nudge-per-day cap.
- Limits: members per khatma (60), and rate limits.
- Content: schedule options shown when creating a khatma, the celebration duas (validated against the verified mushaf source before saving), and WhatsApp message templates for invites and reminders.
- Switches: an announcement banner with on/off and text, maintenance mode (the site shows a kind message and blocks actions), and feature flags for future features, such as the SMS fallback.
- Minimum client version: lets a future mobile app force an update; for the website it forces a reload after a breaking deploy.

**Operations:**

- Look up a khatma by invite code or name: members, round, and pool state.
- Look up a person by phone number: their khatmas and sessions. Sign them out everywhere, or block or unblock the number.
- Reset a khatma's invite link, or hand its creator role to another member, when a creator asks for help.
- Basic numbers: active khatmas, members, ajza' finished per day, khatmas completed, and verification success rate. No per-person reading data in charts.

**Access:**

- Admins sign in with the same WhatsApp verification, and the 6-digit code step is always required for admins.
- Only phone numbers on an admin allowlist can sign in. Ali's number is the first; adding admins happens in the admin panel and is logged.
- Admin sessions expire after 12 hours.
- Every change to settings or user data is written to an audit log: who, what, when, and the old and new values. The admin panel shows this log.
- All admin queries and mutations check the admin role on the server. Hiding a button isn't access control.

## 6. Notifications in v1

- Browser push notifications (Web Push with VAPID keys), requested only after the person takes their first juz', with a plain explanation of why.
- **iPhone limit (the known weak spot of v1):** browser push on iPhone works only after the person adds Silsila to their home screen, on iOS 16.4 or later. After an iPhone user takes their first juz', the site shows simple, illustrated steps for that. The site ships a web app manifest and a service worker so it can be added to the home screen. Many older iPhone users won't do it, which is why WhatsApp reminders (v2) and the mobile apps matter later.
- For people without notifications, any member can tap "remind the group". It opens WhatsApp with a message listing the open ajza' and the target end. It never names anyone who is late.
- WhatsApp messages sent directly by the app are v2.

## 7. Technology (decided by Ali)

Ali settled the stack on 2026-10-27 after a final review: v1 is the website and the admin panel, both on Convex. The mobile apps come later, and Ali will choose their technology then.

- **Public website (`apps/web`):** Vite + React + TypeScript + Tailwind CSS. Mobile-first, right-to-left, small first download. Installable to the home screen (manifest and service worker).
- **Admin panel (`apps/admin`):** a separate Vite + React + TypeScript app on its own address, such as `admin.silsila.app`. Desktop-first. See 5.5.
- **Backend:** Convex, for live updates across members' screens, transactional "take a juz'" to prevent double-booking, scheduled functions for round boundaries and nudges, and HTTP actions for the WhatsApp webhook. Ali chose Convex over Firebase and Supabase after a comparison.
- **Convex region:** EU West (Ireland), the closer of Convex's two regions (US East and Ireland) to Gulf users **[builder's call]**. A deployment's region can't be changed later.
- **Convex client:** the official Convex React client in both apps.
- **Repo layout:** one repo with `convex/` (backend), `apps/web`, and `apps/admin`. Both apps import Convex's generated types, so a backend change that breaks a screen fails the type check. A mobile app can be added later as `apps/mobile`; keep business rules (rotation, pace, release, completion) in Convex functions, not in the website, so a future mobile app reuses them unchanged.
- **Web hosting:** the builder picks a host that serves static Vite builds and supports a small server function for the WhatsApp link preview (3.4), such as Vercel or Cloudflare Pages.
- **Sign-in:** phone number verified through WhatsApp (see 5.2). No passwords.
- **WhatsApp:** v1 uses share links plus the WhatsApp Business Cloud API for receiving verification messages and replying within the 24-hour window. Reminders sent through the API, which need approved templates and consent, are v2.
- **Prerequisites only Ali can do:** a Meta Business account, a dedicated phone number for Silsila registered on the WhatsApp Business Cloud API, Meta business verification, and a domain name for the website and admin panel. They're tracked as Linear tasks assigned to Ali. Apple, Google Play, and push-service accounts wait for the mobile decision.
- **Repo:** public, at `github.com/alilibx/silsila`. No secrets in the repo.

Left to the builder: routing and state libraries, the i18n library, the web-push library, the test setup, the admin UI component library, and the source of juz' metadata (names and starting surah and ayah, for example from Tanzil's public metadata).

## 8. Data the system needs (sketch, not a schema)

- **Khatma:** name, schedule, creator, invite code, created at, completed-rounds count.
- **Member:** khatma, display name, person, joined at, nudges on or off.
- **Person:** phone number (E.164), verified at, display name, hashed session tokens (with device type and last-used time), language, time zone, push subscriptions.
- **Setting:** key, value, updated by, updated at.
- **Admin:** phone number, added by, added at.
- **Audit log entry:** admin, action, target, old value, new value, time.
- **Verification:** one-time code, app or browser session, created at, expires at, status, verified phone number.
- **Round:** khatma, number, start, target end, completed at.
- **Assignment:** round, juz' number (1 to 30), member, taken at, finished at, released at, released-by-system flag.

Pace and rotation derive from assignments. The builder owns the actual schema.

## 9. Privacy and safety

- What the system stores, and nothing else:
  - **Per person:** display name, verified phone number (E.164), language, time zone, push subscriptions, and hashed session tokens with device type and last-used time (for the signed-in devices list in 5.2).
  - **Per verification:** the one-time code, the session it belongs to, timestamps, status, and the sending phone number.
  - **For rate limiting:** IP addresses, kept for at most 24 hours.
  - **Reading activity:** taken, finished, and released times per juz' (for pace and rotation).
  - No emails, contacts, or location.
- Phone numbers are never shown to other members. A person sees only their own number, masked.
- Anyone with a khatma's invite link can view it. Only verified members can act in it. The creator can reset a leaked link (5.4).
- Verify the WhatsApp webhook signature on every request. Rate-limit verification attempts per session, per sending number, and per IP address (5.2).
- No third-party analytics in v1 **[builder's call]**.
- Rate-limit joining and taking ajza' to slow abuse.

## 10. Decisions Ali made after review (2026-10-27)

1. When a round finishes early, the next round starts right away (3.3).
2. The grid shows names only on ajza' being read, and never hides them for being late. Finished ajza' show no names (3.7).
3. v1 is Arabic only. English follows (5.1).
4. The celebration uses Quranic duas only (3.8).
5. People must verify a phone number to take a juz'. Anyone with the link can view without verifying (3.4, 5.2).
6. v1 is a Vite + React website plus a separate Vite + React admin panel, with Convex as the backend and settings managed live from the admin panel (5.5, 7). The mobile apps come later, and their technology (Expo or Flutter) is decided then.

## 11. Prototype

A throwaway, clickable prototype of these screens was built on 2026-10-27 to check the flows visually. Ali reviewed it and approved the flows. It isn't part of the repo, and the real build doesn't reuse its code. Its visual direction is a reference for the builder: the 30 ajza' drawn as the 30 beads of a misbaha, warm paper and deep green with saffron for "being read", Aref Ruqaa for display text, Readex Pro for UI text, and Amiri Quran for Quranic text. The prototype also showed the verification flow: viewing without verifying, then verifying through WhatsApp when taking a juz'.
