# Wirdak (وِردك) mobile navigation design

- **Date:** 2026-10-29
- **Linear:** [ARQ-277](https://linear.app/manzilo/issue/ARQ-277), project Wirdak · وِردك
- **Builds on:** `docs/superpowers/specs/2026-10-27-silsila-v1-design.md` (the "v1 spec", especially 5.3) and what shipped through v0.3.0
- **Status:** approved by Ali on 2026-10-29, including the builder's calls

Items marked **[builder's call]** are decisions made while writing this up, not by Ali. Ali didn't decide them and can overturn any of them. Everything else is Ali's, from the brainstorm and the mockups he approved on 2026-10-29.

## 1. Intent

Ali wants the website to move like a mobile app, so people can get around in two places:

1. **Between their khatmas.** Today a person reaches another khatma only by tapping the "وِردك" logo to go home and picking it from the list. Nothing says the logo goes home.
2. **Inside one khatma.** Today the khatma page is one long scroll: notes, the ring, the main card, invite and remind, the notifications switch, the organizer's settings link, the 30-juz' grid, and the group total. People must scroll to find the grid or the invite button.

The fix has three parts, all from the approved mockups:

- A **bottom bar** with three labelled buttons: ختماتي, ختمة جديدة, and إعداداتي.
- Inside a khatma: a labelled **back button** "ختماتي", a **"تبديل الختمة" button** next to the khatma name, and three **tabs**: جزئي, الأجزاء, and المجموعة.
- A **switch-khatma sheet** that lists the person's khatmas, so they can jump from one to another without going home.

This stays the same website and PWA. It isn't a native iPhone or Android app.

The mockups showed three phone screens: home with the bar, a khatma on the جزئي tab, and the switch sheet open over a khatma. They used today's colors and fonts. Everything they showed is written down in sections 3 and 4, so a builder doesn't need them.

## 2. Goals, non-goals, and anti-goals

### Goals

1. A signed-in person reaches home, a new khatma, or their settings in one tap from any main screen.
2. From inside a khatma, a person reaches another of their khatmas in two taps ("تبديل الختمة", then the khatma).
3. Inside a khatma, a person reaches their own juz', the 30-juz' grid, or the group actions in one tap, without scrolling to find them.
4. Everything follows v1 spec 5.3: every icon has a word, nothing needs a swipe or long-press, there are no hidden menus, buttons are at least 56px tall, text is at least 18px, and the phone's text-size setting still works.

### Non-goals

- Native apps (Expo or Flutter). Unchanged from the v1 spec.
- Swiping between tabs, page-transition animations, and pull-to-refresh.
- The admin app (`apps/admin`). It keeps its own layout.
- The English UI and offline support. Unchanged.

### Anti-goals (failure even if it works)

- **A hamburger menu, or any menu hidden behind an icon.** Every destination stays visible with a word.
- **A slower invite path.** The 80-year-old who taps an invite link must still take a juz' in under a minute. A visitor sees nothing new in their way (section 5.4).
- **Lost actions.** Every action on today's khatma page is still reachable. Nothing is dropped to make the tabs fit.
- **Navigation that needs explaining.** If an 80-year-old wouldn't know where a button goes, it's wrong.

## 3. The bottom bar

### 3.1 What it shows

Three buttons, each an icon above a word, in this order from the start (right) edge in Arabic:

| Button | Goes to | Active on |
|---|---|---|
| ختماتي | `/` | `/` and `/j/:inviteCode` |
| ختمة جديدة | `/new` | `/new` |
| إعداداتي | `/settings` | `/settings` |

The active button is in `--green` with a semibold label. The others are in `--ink-soft`. The words come from `i18n/ar.ts`, with no hard-coded strings.

**A dot for new messages [builder's call]:** when any of the person's khatmas has an unread note (`hasNote` from `api.khatmas.mine`), ختماتي shows the same saffron dot the home cards use. Its accessible name then includes the words for "new message", for example "ختماتي، رسالة جديدة". This tells a person in one khatma that another khatma needs them.

### 3.2 Where it shows

The bar shows only for a signed-in person (`api.sessions.me` isn't null), on these screens:

- Home (`/`)
- New khatma (`/new`)
- My settings (`/settings`)
- A khatma (`/j/:inviteCode`), for members and non-members who are signed in
- Not found (`*`), so a signed-in person always has a way out **[builder's call]**

It doesn't show:

- For a signed-out visitor, on any screen. Their screens keep today's header links (section 5.4).
- On the celebration screen. It stays full-screen and unchanged.
- On the organizer's settings (`/j/:inviteCode/settings`). It's a sub-screen with its own back link **[builder's call]**.
- On the sign-out page (`/signout`) and behind the handoff gate **[builder's call]**.

### 3.3 How it looks and behaves

- Fixed to the bottom of the screen, full width, on `--card` with a `--line` top border. On wide screens the buttons sit centered inside the same `max-w-xl` column as the page.
- It respects the iPhone home indicator: bottom padding of `env(safe-area-inset-bottom)`. The builder checks that the viewport meta has `viewport-fit=cover`, so this works in the installed PWA (`display: standalone`).
- Each button is at least 56px tall and fills a third of the width. Labels use the base text size and may wrap to two lines at large text sizes. They're never cut off.
- It's a `<nav>` with an accessible name (such as "التنقل"), and the active button has `aria-current="page"`.
- Icons are inline SVGs in `currentColor`, marked `aria-hidden`. The word is the button's name **[builder's call]**.
- Pages that show the bar get enough bottom padding that the bar never covers their last item.
- The toast (finish and undo) sits above the bar, not under it.
- Sheets open over the bar, as they open over the page today.

## 4. Inside a khatma

This section covers a **member** of the khatma. A non-member sees something simpler (section 5.4).

### 4.1 The header

From top to bottom:

1. **Back button "ختماتي".** It replaces today's "وِردك" logo link. It's a link to `/` with a chevron that points toward the start edge (right in Arabic), at least 44px tall. It always goes to `/`. It doesn't use browser history, because people often arrive from a push notification or a WhatsApp link with no history behind them. The "؟" help button stays where it is, at the top end.
2. **The khatma name** (as today), with a **"تبديل الختمة" button** on the same line, at the end edge (left in Arabic). A long name wraps, and the button stays beside its first line. The button is a bordered, labelled button that opens the switch sheet (section 4.3). It shows only when the person is a member of two or more active khatmas **[builder's call]**. With one khatma there's nothing to switch to, and the bar already has ختمة جديدة.
3. **The chips**: round, schedule, and target date, as today.
4. **The tabs** (section 4.2).

### 4.2 The tabs

Three tabs, in this order from the start edge: **جزئي**, **الأجزاء**, and **المجموعة**. They're a segmented control in the mockup's style: a `--paper-2` track with the selected tab on `--card` in `--green-deep`.

| Tab | Holds (all of it exists today) |
|---|---|
| جزئي | The notes, the ring, and the main card (take, finish, release, still reading) |
| الأجزاء | The 30-juz' grid with its heading, open count, and legend. Tapping an open juz' opens the take sheet as today. |
| المجموعة | Invite on WhatsApp, remind the group (when a juz' is open), the notifications switch, the organizer's settings link (organizer only), and the group's completed-khatmas line |

Behavior:

- Each tab is at least 56px tall and has a word. There's no swipe between tabs.
- The open tab lives in the URL: no parameter for جزئي, `?tab=pool` for الأجزاء, and `?tab=group` for المجموعة. Any other value means جزئي. Switching tabs replaces the URL rather than adding to history, so the phone's back gesture leaves the khatma instead of stepping back through tabs **[builder's call]**. Other query parameters on the URL, such as `from`, stay as they are.
- The control is an ARIA tablist: `role="tablist"`, each tab a `role="tab"` button with `aria-selected` and `aria-controls`, and the content a `role="tabpanel"`. Arrow keys move between tabs.
- A push notification or invite link to `/j/:inviteCode` opens on جزئي, where the person's main action is.
- The main card's "اختر بنفسك" link (today `href="#pool"`) switches to الأجزاء instead of scrolling.
- The organizer's settings page links back to `/j/:inviteCode?tab=group`, the tab its link lives on **[builder's call]**.
- The sheets that open from any tab (take, release, share, push prompt, install steps, and verify) work as today.
- **After a take from الأجزاء** (including one that started from "اختر بنفسك"), the page switches to جزئي once the take is confirmed, so the person sees their juz' card with its finish button at once **[builder's call]**. The undo toast shows as today. A signed-in non-member who takes a juz' becomes a member, so their page turns into the tabbed page, open on جزئي.
- **Scrolling:** the header and tabs aren't pinned. The whole page scrolls as today, and only the bottom bar stays fixed **[builder's call]**.

### 4.3 The switch-khatma sheet

It uses the existing `Sheet` component, so it closes with its labelled button or Escape and keeps focus inside while it's open.

- **Title:** "اختر ختمة".
- **One row per active khatma**, in the order of `api.khatmas.mine` (the order home uses). Each row shows the name, "١٨ من ٣٠", the "جزؤك" pill when the person holds a juz' there, and the saffron dot when it has an unread note. Each row is a link at least 56px tall.
- **The khatma the person is in** has a `--green` border and a check mark, and `aria-current="page"`. Tapping it closes the sheet.
- **Tapping another row** goes to `/j/:inviteCode` (جزئي tab) and closes the sheet.
- **Below the rows:** a dashed "ابدأ ختمة جديدة" link to `/new`, in the style of home's "start new" button.
- **At the bottom:** the sheet's close button, "إغلاق".

## 5. Other screens

### 5.1 Home

The header keeps "وِردك" as a title and drops the "إعداداتي" link, since the bar has it. The khatma cards and the "start a new khatma" button stay as they are.

### 5.2 New khatma and my settings

For a signed-in person, these pages drop their top "home" or "back" link, since the bar has ختماتي **[builder's call]**. A signed-out person on `/new` keeps today's back link, because they have no bar.

### 5.3 The organizer's settings

No bar. Its back link stays ("العودة إلى الختمة") and goes to the المجموعة tab (section 4.2).

### 5.4 Visitors and non-members

- **A signed-out visitor** sees no bar on any screen. The khatma page shows today's "وِردك" logo link and today's single scrolling page, with no tabs and no switch button.
- **A signed-in person who isn't a member** (for example, someone who followed an invite link) gets the bar, but the khatma page has no tabs and no switch button. It shows today's single page: the invited note, the ring, the main card, and the grid **[builder's call]**. Their one job is to take a juz', and the tabs would only put the grid one tap away.

The invite path is the anti-goal to protect: tap the link, take a juz', and verify through WhatsApp, with no new step in between.

### 5.5 Celebration, sign-out, and not found

The celebration and sign-out screens don't change. Not found gets the bar for a signed-in person (section 3.2).

## 6. Testing

- **Unit tests (Vitest, jsdom):**
  - The bar shows and hides by sign-in state and route, as in section 3.2.
  - The active button has `aria-current="page"`, and the dot appears when a khatma has a note.
  - The khatma tabs: the default tab, `?tab=pool` and `?tab=group`, unknown values, `from` kept on switch, and arrow keys.
  - Members get tabs, and non-members and signed-out visitors don't.
  - "اختر بنفسك" switches to الأجزاء, and a confirmed take from الأجزاء switches to جزئي.
  - The switch sheet: shown only with two or more khatmas, marks the current one, and navigates.
  - Update the existing `KhatmaPage` tests that find the grid or the invite button, which now sit on other tabs.
- **e2e (Playwright, 390×844):** update `e2e/core-loop.spec.ts` and `e2e/grace.spec.ts` wherever they reach the grid, invite, or settings, so they go through the tabs and the bar. Add one step that moves from one khatma to another with the switch sheet.
- **By hand on staging** (`stg.wirdak.app`): an iPhone with the PWA installed, to check the bar clears the home indicator, and the phone's largest text size, to check that the labels wrap and nothing is cut off.

## 7. Left to the builder

- Component names and file layout (for example `components/BottomBar.tsx`, `components/KhatmaTabs.tsx`, `components/SwitchKhatmaSheet.tsx`).
- Where the bar mounts (in `App.tsx` beside `StatusBanners` and `HelpButton`, or in a layout route), and how it reads the session and `mine` without extra queries on pages that already load them.
- The exact icons, spacing, and the words of new strings other than the ones named here.
