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
2. Invite people with a link that opens in the browser, with no download and no password.
3. Share a pool of 30 ajza'. Each person holds one juz' at a time and takes another after finishing.
4. Rotate ajza', so people get offered ones they haven't read recently.
5. Show everyone the state of the pool: open, being read (and by whom), and done.
6. Learn each person's reading pace and nudge them privately and gently.
7. Celebrate each completed khatma as a group, with the khatm dua.
8. Send reminders as browser notifications, and offer WhatsApp share buttons.

### Non-goals (v1)

- The English UI. It comes in a follow-up release; v1 is Arabic only.
- Dedicating a khatma, such as "على روح جدّي". It can come later as one optional field **[builder's call]**.
- Reading or listening to the Quran inside the app. That comes later.
- WhatsApp Business API reminders. That's v2.
- Native iOS and Android apps. That's v3.
- AI assistance. That comes later.
- Accounts, passwords, or email sign-in.
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

The creator answers two questions on one screen:

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

### 3.4 Joining

- Any member can share the invite link. The share button opens WhatsApp with a ready-made Arabic message.
- Tapping the link opens the khatma in the browser. The person sees the khatma name, how many people are in it, and one field: "your name". Then one button: "join" (انضم).
- No password, phone number, or email. The browser remembers the person (see 5.2).
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
- A browser notification goes to all members who enabled notifications: "ختمنا القرآن معاً، الحمد لله".
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
- All UI text lives in translation files from day one, with no hard-coded strings, so adding English later is mostly a translation job. Use direction-neutral CSS (logical properties such as `margin-inline-start`), so the layout flips correctly when English arrives.
- Numbers in the Arabic UI use Eastern Arabic digits (١٢٣) **[builder's call]**.
- Dates use the Gregorian calendar in v1. Hijri dates can come later **[builder's call]**.

### 5.2 Identity without accounts

- Joining creates a member record and stores a secret device token in the browser.
- Each person gets a personal "return link" that restores their identity on a new phone or after clearing the browser. The app offers to send it to themselves on WhatsApp right after they join. This is **[builder's call]**; without it, people lose their history when they change phones.
- One person on one device can be in many khatmas. The home screen lists them.

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

- Browser push notifications, requested only after the person takes their first juz', with a plain explanation of why.
- **iPhone limit:** browser notifications on iPhone work only after the person adds the app to their home screen, on iOS 16.4 or later. The app shows simple, illustrated steps for that on iPhone.
- For people without notifications, any member can tap "remind the group". It opens WhatsApp with a message listing the open ajza' and the target end. It never names anyone who is late.
- WhatsApp messages sent directly by the app are v2.

## 7. Technology (decided by Ali)

- **Web app:** Next.js with TypeScript and Tailwind CSS. Installable as a PWA (manifest and service worker).
- **Backend:** Convex, for live updates across members' screens, transactional "take a juz'" to prevent double-booking, and scheduled functions for round boundaries and nudges.
- **Hosting:** Vercel.
- **Sign-in:** none in v1. Name-only join (see 5.2).
- **WhatsApp:** share links in v1, WhatsApp Business Cloud API reminders in v2.
- **Mobile apps:** v3.
- **Repo:** public, at `github.com/alilibx/silsila`. No secrets in the repo.

Left to the builder: the i18n library, the web-push setup (VAPID keys and the sending library), the test setup, and the source of juz' metadata (names and starting surah and ayah, for example from Tanzil's public metadata).

## 8. Data the system needs (sketch, not a schema)

- **Khatma:** name, schedule, creator, invite code, created at, completed-rounds count.
- **Member:** khatma, display name, person, joined at, nudges on or off.
- **Person:** device token hash, return-link token hash, language, time zone, push subscriptions.
- **Round:** khatma, number, start, target end, completed at.
- **Assignment:** round, juz' number (1 to 30), member, taken at, finished at, released at, released-by-system flag.

Pace and rotation derive from assignments. The builder owns the actual schema.

## 9. Privacy and safety

- Store only a display name, language, time zone, and push subscriptions. No phone numbers or emails in v1.
- Only members of a khatma can see it, through its invite link.
- No third-party analytics in v1 **[builder's call]**.
- Rate-limit joining and taking ajza' to slow abuse.

## 10. Decisions Ali made after review (2026-10-27)

1. When a round finishes early, the next round starts right away (3.3).
2. The grid shows names only on ajza' being read, and hides them once a juz' is overdue. Finished ajza' show no names (3.7).
3. v1 is Arabic only. English follows (5.1).
4. The celebration uses Quranic duas only (3.8).
