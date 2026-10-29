# WhatsApp templates for rotating khatmas

The templates for messages Wirdak starts to a rota member or organizer, ready to submit to the "Wirdak" messaging account of the Manzilo business. Production and staging share them. The code is in `convex/lib/rotaTemplates.ts` (members) and `convex/lib/whatsappTemplates.ts` (`NOTE_TEMPLATES`, organizers).

## Rules for every template

- **Category:** UTILITY. **Language:** `ar`.
- Plain status updates only: no prayers, questions, invitations or footers. Meta read every one of those as MARKETING in the first rounds (see `docs/superpowers/specs/2026-10-29-wirdak-whatsapp-templates-design.md`, section 3.3). If Meta approves one as MARKETING anyway, reword it and submit it under a new name (a deleted template's name stays taken). Don't send it as marketing.
- **Link tracking off** on every URL button, so invite codes don't pass through Meta's tracker.
- The dua is never in a template. It goes out as free-form text inside the 24-hour window, or behind the «دعاء الختم» button of `wirdak_rota_complete`.
- Header: text, `{{1}}` = the khatma's title as the app shows it (at most 60 characters). Sample: `ختمة العائلة`.
- Quick-reply buttons carry a payload per send (`r1|<p or s>|<action>|<dayId>|<participantId>`), so their labels are fixed here and the payloads are not part of the submission.
- Sample values are the examples Meta asks for.

## Messages to members

All have header `{{1}}` and quick-reply buttons only.

| Name | Body | Body samples | Buttons |
| --- | --- | --- | --- |
| `wirdak_rota_juz` | `الختمة {{1}} اليوم. جزؤك: {{2}}.` | `٣`, `الجزآن ٥ و٦` | «أتممت», «ليس بعد» |
| `wirdak_rota_reminder` | `تذكير بقراءتك اليوم: {{1}} لم يُسجَّل بعد.` | `الجزء ٢٦` | «أتممت», «ليس بعد» |
| `wirdak_rota_assigned` | `تحديث على قراءتك: أُسند إليك {{1}} في الختمة {{2}} اليوم.` | `الأجزاء ٣، ٥ و٦`, `٧` | «أتممت», «ليس بعد» |
| `wirdak_rota_covered` | `تحديث على قراءتك: قُرئ {{1}} عنك اليوم، فلم يعد عليك.` | `الجزء ٢٦` | none |
| `wirdak_rota_complete` | `تحديث على الختمة: اكتملت قراءة الأجزاء الثلاثين في الختمة {{1}}.` | `٣٠` | «دعاء الختم» |
| `wirdak_rota_cycle` | `تحديث على قراءتك: أكملت ثلاثين جزءاً في ثلاثين ختمة، أي القرآن كاملاً.` | none | none |

The juz' text (`{{1}}` or `{{2}}` above) is `الجزء ٢٦` for one juz', `الجزآن ٥ و٦` for two and `الأجزاء ٣، ٥ و٦` for three or more.

## Messages to the organizer

Header `{{1}}` and one URL button, «افتح الختمة», to `https://wirdak.app/{{1}}` (button sample: `j/AB12CD`; staging sends `stg/j/<code>`).

| Name | Body | Body samples |
| --- | --- | --- |
| `wirdak_rota_unread` | `تحديث على الختمة التي تنظّمها: {{1}} لم يُسجَّل بعد اليوم.` | `الجزآن ٥ و٦` |
| `wirdak_rota_summary` | `تحديث على الختمة التي تنظّمها: تمّت قراءة {{1}} من ٣٠ جزءاً اليوم.` | `٢٤` |
| `wirdak_rota_join_request` | `تحديث على الختمة التي تنظّمها: طلب انضمام جديد من {{1}}.` | `أحمد` |

The organizer notes `rotaSilent`, `rotaSilenced` and `rotaStopped` have no template: in-app and push only.
