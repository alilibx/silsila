# Wirdak WhatsApp templates: design

Linear: ARQ-275 (under ARQ-245). Date: 2026-10-29.

## 1. Why

Today Wirdak uses WhatsApp only to sign people in. Every reminder and alert reaches a member as an in-app note and, if they set it up, a web push. Push is hard for the people this app is for. On an iPhone it works only after adding Wirdak to the home screen, and many members never do. They all have WhatsApp, because that's how they signed in.

Ali wants three things (his words: "work on the whatsapp templates and test them with URLs hidden and all notifications also for Authentication template for code copy and stuff"):

1. The sign-in code arrives in WhatsApp's own authentication format, with a copy-code button.
2. Every notification can also arrive on WhatsApp.
3. No raw URLs in message text. Links sit behind buttons.

Business-started WhatsApp messages need templates that Meta has approved, plus the person's opt-in. The plan 2 spec (section 2) and the plan 3 spec (section 2) list "WhatsApp messages from the app" as a non-goal for that reason. This work brings it into scope. Both specs get a note pointing here.

## 2. Goals, non-goals, anti-goals

**Goals**

- An authentication template for the 6-digit PIN, with a copy-code button.
- The replies Wirdak already sends within the 24-hour window ("verified", "new sign-in", "account created") get a link button instead of a URL in the text.
- One utility template per notification kind, each with an "open the khatma" button.
- A per-person opt-in for WhatsApp notifications, off by default.
- WhatsApp notifications follow the same rules as push: the member's per-khatma notifications switch, quiet hours, and clearing.
- Each template is sent once from staging to Ali's phone before the PR is handed over.

**Non-goals**

- Changing what triggers a notification, or the one-nudge-a-day cap.
- Answering help requests over WhatsApp (quick-reply buttons, "I'll take it"). That's a later step.
- Replies to a notification. Today any non-code text gets the "no code found" reply (`NO_MATCH_REPLY`). That reads oddly when someone answers a reminder with "جزاك الله خيراً". It is noted as a follow-up and not fixed here.
- Admin panel sign-in (plan 3a). The admin PIN can reuse the same authentication template later.
- Admin-editable template text (v1 spec 5.5). The texts stay in code.

**Anti-goals** (this fails even if it technically works if...)

- A sign-in or session token ends up in a template button URL (ARQ-272).
- Someone gets WhatsApp messages without turning them on.
- A member gets a WhatsApp message between 22:00 and 07:00 their time.
- A failed WhatsApp send undoes or blocks the note or push.
- A template gets recategorized as marketing because its wording reads as promotional.

## 3. The templates

All templates are in Arabic (`ar`), on the Manzilo business, for the shared number that production and staging use. Template names are fixed in code (`convex/lib/whatsappTemplates.ts`), one table from note kind to template name and parameters.

### 3.1 Authentication: `wirdak_pin`

- Category AUTHENTICATION. Meta fixes the body ("‏{{1}} هو رمز التحقق الخاص بك.") and adds the security line ("لأمانك، لا تشارك هذا الرمز."). A COPY_CODE button copies the PIN.
- No expiry footer **[builder's call]**. The PIN lifetime is the live setting `verificationTtlMs`, so a fixed "expires in 10 minutes" could turn false when an admin changes it.
- No one-tap or zero-tap autofill. Those work only in Android apps that declare their package to Meta. Wirdak is a website.
- Replaces `pinReply` in both places it's sent: `takeIncoming` (an existing account messaged a code) and `claim` (`needs_pin`).
- What's lost: today's PIN text says the code lets a new device into the account and to ignore it if they didn't ask. Meta's fixed body can't say that. The security line covers part of it, and the "new sign-in" alert still follows every sign-in. Ali asked for the authentication format, so it wins.
- If the template send fails (for example, while it's still pending approval), fall back to today's text reply so sign-in never breaks **[builder's call]**.

The WhatsApp Business tools available to the builder can't create AUTHENTICATION templates, so `wirdak_pin` is created through the Graph API (`POST /<account id>/message_templates`) with the system-user token that Convex already holds. The token is read from the Convex environment straight into the request and never printed. If the token lacks the template permission, Ali creates `wirdak_pin` in WhatsApp Manager with exactly the settings above, through a Linear task assigned to him that blocks ARQ-275.

### 3.2 In-window replies: interactive link buttons, no templates

`matchedReply`, `signInAlert` and `accountCreatedAlert` go out seconds after the person messaged the business number, so they sit inside the 24-hour window and need no template. They become `interactive` messages of type `cta_url`: the same body text without the URL, and one button.

| Message | Button label | Button URL |
| --- | --- | --- |
| Verified | ارجع إلى وِردك | `SITE_URL` + return path |
| New sign-in | لستُ أنا | `SITE_URL/signout?t=<alert token>` |
| Account created | لستُ أنا | `SITE_URL/signout?t=<alert token>` |

Meta caps a link button's label at 20 characters, so both alerts say «لستُ أنا» ("not me") on the button and name it in the text ("اضغط «لستُ أنا» لتسجيل الخروج من …") **[builder's call]**.

The alert token is a sign-out-only token, not a sign-in token, and it is unchanged from today. It already travels in the message today, and ARQ-272 strips it on the web side before PostHog sees it. The verified reply with no `SITE_URL` stays plain text.

### 3.3 Notifications: utility templates

Each template has the khatma's title as its header, the note's own text as its body, a footer and one URL button. This matches what a push shows: the title, then the text.

- Header: `{{1}}`, the khatma title exactly as the app shows it. That's the name, or `ختمة <date>` for an unnamed khatma (`t.khatma.untitled`, the same date format as the app). A header holds at most 60 characters, and `cleanKhatmaName` already caps names at 60. Putting the title in the header instead of the body means an unnamed khatma never reads "في ختمة «ختمة ٢٩ أكتوبر»" **[builder's call]**.
- No footer (only `wirdak_almost_up` kept `أوقف رسائل واتساب من الإعدادات في وِردك`, see below). Settings and the privacy page say how to turn the messages off.
- Button: `افتح الختمة`, URL `https://wirdak.app/{{1}}`. The suffix is `j/<inviteCode>` on production and `stg/j/<inviteCode>` on staging (see 3.4).
- Send TTL: 1 hour **[builder's call]**. Sends happen only in waking hours (4.2), and a short TTL keeps a message to an offline phone from arriving deep in the night. An expired message is lost, but the in-app note stays.

| Name | Note kind | Body |
| --- | --- | --- |
| `wirdak_almost_up` | almostUp | مهلة الجزء {{1}} أوشكت على الانتهاء. هل تحتاج وقتاً أطول؟ |
| `wirdak_open_for_help_v2` | openForHelp, 1 juz' | تحديث على الختمة التي تنظّمها: الجزء {{1}} لم يعد محجوزاً لأحد، وصار متاحاً لأي عضو. |
| `wirdak_open_for_help_many_v2` | openForHelp, 2 or more | تحديث على الختمة التي تنظّمها: الأجزاء {{1}} لم تعد محجوزة لأحد، وصارت متاحة لأي عضو. |
| `wirdak_juz_helped` | thanks | تحديث على حجزك: عضو آخر يُكمل الآن الجزء {{1}} الذي كان محجوزاً لك، فلم يعد عليك. |
| `wirdak_reminder_v2` | reminder | تذكير بحجزك: الجزء {{1}} محجوز لك في هذه الختمة، ولم يُسجَّل أنك أتممته بعد. |
| `wirdak_behind_v2` | behind | تحديث على الختمة: لتنتهي في موعدها تحتاج {{1}}، وهذه الأجزاء غير محجوزة الآن. |
| `wirdak_completed_v2` | completed | تحديث على الختمة: اكتملت قراءة الأجزاء الثلاثين كلها. |
| `wirdak_now_organizer_v2` | nowOrganizer | تغيير في دورك: أصبحت منظّم هذه الختمة. |
| `wirdak_organizer_moved_v2` | organizerMoved | تغيير في دورك: انتقل تنظيم هذه الختمة إلى عضو آخر لأنك لم تفتح وِردك منذ مدة. ما زلت عضواً فيها. |

**What review taught us (2026-10-29).** The first versions used `noteText` word for word, with the opt-out footer. Meta approved 8 of the 9 as MARKETING: it read the prayers ("يسّر الله لك", "جزاك الله خيراً"), the questions ("هل تأخذ…؟") and the opt-out footer as promotional. Only `wirdak_almost_up` passed as UTILITY. Ali approved neutral rewordings, written as updates on the member's own booking, role or khatma, with no footer. They're submitted under `_v2` names, because a deleted template's name stays taken. Every URL button has Meta's click tracking off, so invite codes don't pass through Meta's tracker. `wirdak_almost_up` keeps its first wording and footer.

Body parameters:

- The juz' list is in Arabic digits (`juzList`, as in `noteText`).
- For `behind`, the parameter is the count with its noun and, when the target end is still ahead, the date, for example `٣ أجزاء قبل الخميس`. It comes from the same helpers as `noteText`, so the WhatsApp and push texts can't drift. Splitting it into "count" and "date" placeholders would put two placeholders next to each other when there's no date, which Meta rejects **[builder's call]**.
- WhatsApp refuses parameters with newlines, tabs or more than 4 spaces in a row, so the sender collapses whitespace in every parameter.
- `openForHelp` has two templates because Arabic agreement differs ("متاح … تأخذه" against "متاحة … أحدها") **[builder's call]**.

The bodies say what `noteText` says. That means they stay non-promotional and about the member's own khatma, so UTILITY fits. If Meta recategorizes one as MARKETING, the builder rewords it and resubmits, and doesn't send it as marketing.

### 3.4 Staging links

A template's URL button fixes the domain, and production and staging share one WhatsApp business account. So the base is `https://wirdak.app/{{1}}`, and staging passes `stg/j/<code>`. `apps/web/vercel.json` gets a redirect from `/stg/:path*` to `https://stg.wirdak.app/:path*`. The redirect only reaches the staging host. On staging itself it redirects to itself, which is harmless.

The redirect is live on `wirdak.app` only after the next production release. Until then a staging test message's button opens production's "not found" page. The test in section 6 checks the button's URL in the message, and the redirect gets checked after the release.

Which suffix to use is decided by `SITE_URL`: `https://stg.wirdak.app` means staging. Anything else that isn't `https://wirdak.app` (local dev) sends nothing in dev without a token, as today **[builder's call]**.

## 4. Opt-in and delivery

### 4.1 The switch

- New optional field `people.whatsappNotes: boolean`. Missing means off.
- On the Settings page, under the device notifications section: a row `رسائل واتساب` with the line `نرسل لك تنبيهات ختماتك على واتساب، على رقمك المسجّل.` Meta's opt-in rules ask that the person sees what they'll get and on which channel before they turn it on.
- Where the app offers push after someone's first juz' (`offerPush` in `useKhatmaActions.ts`, and `HandoffGate`), it also offers WhatsApp, so the people who can't use push see it **[builder's call]**:
  - `PushPromptSheet` (push ready) and `InstallStepsSheet` (iPhone outside the home-screen app) each get a secondary button, `أرسلها لي على واتساب`. It turns the switch on and closes the sheet.
  - Where push is unsupported, which today shows no sheet, a small sheet offers only WhatsApp.
  - Someone who already has WhatsApp on doesn't see the button.
- A new session mutation `people.setWhatsappNotes({ on })`.

### 4.2 When a WhatsApp message goes out

`notify` (`convex/notes.ts`) already decides push. Next to it:

- If the member's `notificationsOn` is true for that khatma and the person's `whatsappNotes` is true, schedule `whatsappNotes.deliver({ noteId })` at `nextAwake(...)`, the same moment as push.
- This doesn't depend on push. A person with both on gets both **[builder's call: each switch means what it says]**.
- `deliver` re-reads the note, like `push.deliveryPlan`. It does nothing if the note was cleared, the member left or turned notifications off, or the person turned WhatsApp off in the meantime. It stamps `notes.whatsappSentAt` and sends the template.
- `deliver` checks quiet hours again at send time, and if it's inside them, reschedules itself for the next waking moment.
- One WhatsApp message per note **[builder's call]**. When a batched "open for help" alert grows after its push went out, `alertOrganizer` pushes it again, because a push with the same tag replaces the old one. WhatsApp can't replace a message, so the grown alert is not sent again on WhatsApp. The organizer sees the full list when they open the khatma.
- No WhatsApp-only cap beyond the existing one-nudge-a-day rule **[builder's call]**. All notifications share one business number with sign-in, though. If many people block it or report it as spam, Meta lowers its quality rating and can restrict it, and that would break sign-in. Opt-in, one message per note and the existing caps keep the volume low. A cap is the first fix if the number's quality rating drops.
- Failures are logged by HTTP status and Graph error code, never with the phone number or the parameters in prod. A failed send isn't retried beyond `sendWhatsAppText`'s single retry on 429 or 5xx.

### 4.3 Sending code

`convex/whatsapp.ts` gets two senders next to `sendWhatsAppText`, sharing its retry and logging:

- `sendWhatsAppTemplate(to, name, { body: string[], buttonSuffix?: string, copyCode?: string })`
- `sendWhatsAppLink(to, body, { label, url })` for interactive `cta_url` messages.

In dev without a token, both log what they would send, as the text sender does.

## 5. Constraints

- Messages from staging use production's number and token (`docs/deploy.md`). A staging send reaches real phones and costs the same as a production send. Tests send only to Ali's number.
- Utility and authentication messages outside the 24-hour window are billed by Meta. Opt-in keeps that to people who asked.
- No new environment variables.
- `bun run typecheck`, `bun run lint` and `bun run test` pass. New code gets unit tests: the template parameters for every kind (both `openForHelp` forms and `behind` with and without a date), the Graph payload shapes, the staging and production suffix, the opt-in checks in `deliver`, and the fallback when the PIN template fails.

## 6. Test on staging

1. Create the templates and wait for approval.
2. Deploy the branch to staging (Deploy workflow, `environment: staging`, `ref`: the branch).
3. From staging, send each template once to Ali's number with real-looking values, through an internal action run from the Convex dashboard or CLI (`whatsappNotes.sendSample({ phone, kind })`). Internal actions can't be called from the website, only by someone with deploy access. It refuses a number that isn't a person on that deployment, and it takes its khatma name and invite code from one of that person's khatmas, so nothing is made up. It runs only when `WIRDAK_ENV` is `dev` or `staging`, never on production **[builder's call]**. After the release, the `/stg/` redirect is checked by opening a URL in a browser, not by sending.
4. Sign in on `stg.wirdak.app` with Ali's number to get the PIN template and the link-button replies.
5. Ali confirms on his phone: every message arrived, the copy button copies the PIN, and no message shows a raw URL.

## 7. Privacy page

`apps/web/public/privacy.html` (Arabic and English) says WhatsApp is used only for sign-in codes and new-device alerts, and that Meta's role is sending those. With this change, Meta also receives khatma titles and juz' numbers for people who turned WhatsApp messages on. The builder drafts the update to both languages in the same PR. Ali approves the wording before merge, because Meta's app review reads this page.

## 8. Left to the builder

- File layout beyond what's named above, and the test structure.
- The exact Graph error codes worth naming in logs.
- Whether `sendSample` lives in `convex/dev.ts` or next to `deliver`.
