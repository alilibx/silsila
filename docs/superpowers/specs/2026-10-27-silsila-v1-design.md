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
2. Invite people with a link that opens the app if it's installed, or the web version instantly if not, with no password. Anyone with the link can view; taking a juz' requires a phone number verified through WhatsApp.
3. Share a pool of 30 ajza'. Each person holds one juz' at a time and takes another after finishing.
4. Rotate ajza', so people get offered ones they haven't read recently.
5. Show everyone the state of the pool: open, being read (and by whom), and done.
6. Learn each person's reading pace and nudge them privately and gently.
7. Celebrate each completed khatma as a group, with the khatm dua.
8. Ship iPhone and Android apps plus a web version from day one. Send reminders as push notifications, and offer WhatsApp share buttons.

### Non-goals (v1)

- The English UI. It comes in a follow-up release; v1 is Arabic only.
- Dedicating a khatma, such as "على روح جدّي". It can come later as one optional field **[builder's call]**.
- Reading or listening to the Quran inside the app. That comes later.
- WhatsApp Business API reminders. That's v2.
- AI assistance. That comes later.
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
| Member | Someone who joined the khatma through its link. |
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
- Passing the target end doesn't take anyone's juz' away. A held juz' returns to the pool only when all three are true: the round is past its target end, the person has held it for more than 3x their pace (see 4.1), and they haven't answered the "keep or release?" nudge (see 4.2) within 24 hours. The person then gets a private, kind message: "We opened juz' 12 so others can help. You can take it back anytime." Nobody else is told who held it. This rule is **[builder's call]**, made after review found that releasing everything at the target end breaks daily khatmas.
- **"No deadline" has no target end.** For that schedule, the features that depend on a deadline are off: the overdue release, the "round is behind" nudge, the target end above the grid, and the deadline line in "remind the group". The 1.5x and 3x pace nudges still apply **[builder's call]**.

### 3.4 Joining and verifying

- Any member can share the invite link. The share button opens WhatsApp with a ready-made Arabic message.
- Tapping the link opens the khatma in the Silsila app if it's installed (iOS universal links, Android app links). Otherwise it opens the web version straight away, with no app store in the way. The web page shows the inviter and khatma name in plain HTML at once, while the Flutter app loads behind it.
- Anyone with the link can see the khatma, its pool, and who is reading what, with no name, number, or verification.
- **Taking a juz' requires a verified phone number.** Ali decided this. The first time someone taps "take a juz'", one sheet asks for their name and offers one button: "تحقّق عبر واتساب" (verify with WhatsApp). See 5.2 for how it works.
- A person becomes a member of the khatma when they verify. Viewers who never verify aren't members and don't count toward the member total **[builder's call]**.
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

- **"I finished" (أتممت القراءة).** The juz' turns done. The person sees "تقبّل الله منك" and an offer to take another juz' if any are open. An undo option stays visible for 10 seconds.
- **"I can't finish it" (لا أستطيع إكماله)**, the smaller of the two. The juz' returns to the pool. Nobody is notified, and nobody sees who released it.

### 3.7 The pool view

A grid of 30 tiles, one per juz'. Each tile shows the juz' number and its name, taken from the opening words of the juz' in the mushaf, such as "عمّ" for 30, "تبارك" for 29, and "قد سمع" for 28. Using the opening words avoids regional naming differences **[builder's call]**. Each tile has one of three states, shown with color plus a word, never color alone:

- **Open (متاح):** anyone can take it.
- **Being read (يُقرأ):** shows the reader's name, because Ali's pain point was not knowing who has what. Once the round is past its target end and this person has held the juz' for more than 3x their pace, the name is hidden and the tile shows only "يُقرأ". Ali decided this.
- **Done (تمّ):** shows no name, so nobody can count who finished the most. Ali decided this.

Above the grid: "١٨ من ٣٠ تمّت" with a progress bar, and the round's target end.

### 3.8 Completing a khatma

When the 30th juz' is marked done:

- Every member sees a celebration screen the next time they open the app: the round number, the number of people who took part, and a khatm dua made only of Quranic duas, such as «رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنتَ السَّمِيعُ العَلِيمُ» (2:127). Ali decided on Quranic duas only, because the popular long khatm dua has a disputed attribution. The builder picks the verses and must copy them exactly, with diacritics, from a verified mushaf text source.
- A push notification goes to all members who enabled notifications: "ختمنا القرآن معاً، الحمد لله".
- A WhatsApp share button posts "we completed khatma number 12 together" to the family group.
- The round's history is kept, so the group sees "12 khatmas completed together".

## 4. Pace, nudges, and encouragement

### 4.1 Pace

- The app records how long each person takes from taking a juz' to marking it done.
- A person's pace is the median of their last 5 finished ajza' across all their khatmas. Until they have 3 finished ajza', the default pace is 3 days **[builder's call]**.
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
- No notifications between 22:00 and 07:00 in the person's time zone.
- Each person can turn off nudges for a khatma.

"Behind" means the number of open ajza' is more than the expected pace of the members who hold nothing can cover before the target end. The builder picks the exact formula.

### 4.3 Gamification without ranking

- **Group:** total khatmas completed together, and the current round's progress. These are visible to all members.
- **Personal:** ajza' read and a weekly streak. These are visible only to the person.
- No leaderboard, no badges comparing people, and no "fastest reader".

## 5. Experience requirements

### 5.1 Language and layout

- v1 ships in Arabic only, right-to-left. Ali decided this.
- All UI text lives in translation files from day one, with no hard-coded strings, so adding English later is mostly a translation job. Use direction-aware layout (Flutter's `EdgeInsetsDirectional`, `AlignmentDirectional`, and `start`/`end` rather than left/right), so the layout flips correctly when English arrives.
- Numbers in the Arabic UI use Eastern Arabic digits (١٢٣) **[builder's call]**.
- Dates use the Gregorian calendar in v1. Hijri dates can come later **[builder's call]**.

### 5.2 Identity: phone number verified through WhatsApp

A person's identity is their phone number, verified through WhatsApp. Ali decided that phone numbers are collected and verified, and that verification gates taking a juz'. The method below is **[builder's call]**, chosen because older users struggle to type codes from SMS.

**How verification works ("reverse" verification):**

1. The person taps "تحقّق عبر واتساب". The app creates a pending verification with a random one-time code, tied to this app or browser session. It expires after 10 minutes.
2. The app opens `wa.me/<Silsila's WhatsApp number>?text=...` with a ready-made message such as "رمز التحقق في سلسلة: 4821".
3. The person taps send in WhatsApp. They never type their number or copy a code.
4. Silsila's WhatsApp Business Cloud API webhook receives the message. WhatsApp supplies the sender's phone number. The backend matches the code, saves the number in E.164 format, and marks the person verified.
5. The app watches the verification live and continues automatically: "تمّ التحقق" and the take-a-juz' sheet. Silsila also replies in WhatsApp with "تمّ التحقق، ارجع إلى سلسلة" and a link back. Replies within 24 hours of a user's message don't need an approved template.
6. The app shows the masked number to the person ("‎+971 50 ••• 1234، هذا رقمك؟") with a "not me" option. This catches a verification link that was forwarded to someone else.

**Rules:**

- After verification, the backend issues a session token that the app stores securely (Keychain on iPhone, Keystore on Android, browser storage on web), so the person stays signed in.
- On a new phone, app install, or browser, the person verifies again with the same number, and their khatmas and history come back. This replaces the "return link" from the earlier draft.
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
- Remove a member. Their held juz' returns to the pool.
- Reset the invite link if it leaks.

Nothing else. The creator can't assign ajza' or mark ajza' done for others **[builder's call]**.

## 6. Notifications in v1

- Push notifications, requested only after the person takes their first juz', with a plain explanation of why.
- **In the apps:** iPhone and Android push through Firebase Cloud Messaging (FCM), which delivers to iPhone through Apple's push service. Firebase is used only for push; Convex remains the backend.
- **On the web:** browser push. On iPhone, browser push works only after adding the site to the home screen (iOS 16.4 or later). So after a web user takes their first juz', the web version suggests installing the app, with a direct App Store or Google Play link **[builder's call]**.
- For people without notifications, any member can tap "remind the group". It opens WhatsApp with a message listing the open ajza' and the target end. It never names anyone who is late.
- WhatsApp messages sent directly by the app are v2.

## 7. Technology (decided by Ali)

Ali changed the stack on 2026-10-27 after seeing the prototype, so that mobile apps ship from day one.

- **Client:** Flutter, one codebase for the iPhone app, the Android app, and the web version.
- **Over-the-air fixes:** Shorebird code push for the iPhone and Android apps. Web deploys reach everyone immediately and don't need it.
- **Backend:** Convex, for live updates across members' screens, transactional "take a juz'" to prevent double-booking, scheduled functions for round boundaries and nudges, and HTTP actions for the WhatsApp webhook. Ali chose Convex over Firebase and Supabase after a comparison.
- **Convex region:** EU West (Ireland), the closer of Convex's two regions (US East and Ireland) to Gulf users **[builder's call]**. A deployment's region can't be changed later.
- **Flutter-to-Convex client (main technical risk):** Convex has no official Flutter client. Community options include `dartvex`, `convex_flutter` (wraps Convex's Rust client), and `convex_dart`. The builder must:
  1. Make the first plan task a proof that the chosen client works on a real iPhone, Android phone, and the web: live subscriptions, custom-token sign-in after WhatsApp verification, and reconnecting after a dropped connection. If it fails, stop and report to Ali before building further.
  2. Wrap the client in one thin data layer, so screens never call it directly and replacing it touches one place.
- **Web hosting:** the builder picks a static host for the Flutter web build, and it must also serve the files that iOS universal links and Android app links need.
- **Sign-in:** phone number verified through WhatsApp (see 5.2). No passwords.
- **WhatsApp:** v1 uses share links plus the WhatsApp Business Cloud API for receiving verification messages and replying within the 24-hour window. Reminders sent through the API, which need approved templates and consent, are v2.
- **Prerequisites only Ali can do:** a Meta Business account, a dedicated phone number for Silsila registered on the WhatsApp Business Cloud API, Meta business verification, an Apple Developer account, a Google Play developer account, a Shorebird account, and a Firebase project with an Apple push key (APNs) for notifications. They're tracked as Linear tasks assigned to Ali.
- **Repo:** public, at `github.com/alilibx/silsila`. No secrets in the repo.

Left to the builder: state management, the i18n setup (Flutter's built-in localization is fine), the web-push setup, the test setup, which community Convex client to use (after the proof task), and the source of juz' metadata (names and starting surah and ayah, for example from Tanzil's public metadata).

## 8. Data the system needs (sketch, not a schema)

- **Khatma:** name, schedule, creator, invite code, created at, completed-rounds count.
- **Member:** khatma, display name, person, joined at, nudges on or off.
- **Person:** phone number (E.164), verified at, display name, device token hashes, language, time zone, push subscriptions.
- **Verification:** one-time code, app or browser session, created at, expires at, status, verified phone number.
- **Round:** khatma, number, start, target end, completed at.
- **Assignment:** round, juz' number (1 to 30), member, taken at, finished at, released at, released-by-system flag.

Pace and rotation derive from assignments. The builder owns the actual schema.

## 9. Privacy and safety

- Store only a display name, a verified phone number, language, time zone, and push subscriptions. No emails.
- Phone numbers are never shown to other members. A person sees only their own number, masked.
- Anyone with a khatma's invite link can view it. Only verified members can act in it. The creator can reset a leaked link (5.4).
- Verify the WhatsApp webhook signature on every request, and rate-limit verification attempts per session and per number.
- No third-party analytics in v1 **[builder's call]**.
- Rate-limit joining and taking ajza' to slow abuse.

## 10. Decisions Ali made after review (2026-10-27)

1. When a round finishes early, the next round starts right away (3.3).
2. The grid shows names only on ajza' being read, and hides them once a juz' is overdue. Finished ajza' show no names (3.7).
3. v1 is Arabic only. English follows (5.1).
4. The celebration uses Quranic duas only (3.8).
5. People must verify a phone number to take a juz'. Anyone with the link can view without verifying (3.4, 5.2).
6. iPhone and Android apps ship in v1, alongside the web version. Flutter with Shorebird is the client, and Convex is the backend (7).

## 11. Prototype

A throwaway, clickable prototype of these screens was built on 2026-10-27 to check the flows visually. Ali reviewed it and approved the flows. It isn't part of the repo, and the real build doesn't reuse its code. Its visual direction is a reference for the builder: the 30 ajza' drawn as the 30 beads of a misbaha, warm paper and deep green with saffron for "being read", Aref Ruqaa for display text, Readex Pro for UI text, and Amiri Quran for Quranic text. The prototype also showed the verification flow: viewing without verifying, then verifying through WhatsApp when taking a juz'.
