# Silsila v1 core loop implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A family can open an invite link, verify through WhatsApp, take, finish, undo, and release ajza', and complete a khatma together on an Arabic website backed by Convex.

**Architecture:** One pnpm monorepo. `convex/` holds all business rules (verification, khatma, rounds, rotation, completion) as Convex queries, mutations, actions, and HTTP actions. `apps/web` is a thin Vite + React client that renders Convex query results and calls Convex functions; it holds no business rules. Identity is a phone number verified by a WhatsApp message; the browser keeps a session token in `localStorage` and passes it to every Convex function.

**Tech Stack:** Node 22 LTS, pnpm 9 workspaces, TypeScript (strict), Convex, `convex-helpers`, Vitest, `convex-test`, Vite, React 19, React Router 7 (`react-router`), Tailwind CSS v4 (`@tailwindcss/vite`), Testing Library, Playwright (smoke only).

**Spec:** `docs/superpowers/specs/2026-10-27-silsila-v1-design.md`

**Linear:** ARQ-245. Branch names: `feat/arq-245-<task-slug>`; one PR per task or per pair of small tasks, each reviewed before merge.

**Out of scope (later plans):** pace, nudges, automatic release, browser push, quiet hours, creator powers and succession, WhatsApp link preview (plan 2); admin panel and editing settings (plan 3). Where this plan touches those areas, it leaves a named hook for plan 2.

## Global Constraints

- v1 UI is Arabic only, `dir="rtl"`, `lang="ar"`. All UI text comes from `apps/web/src/i18n/ar.ts`; no Arabic string literals in components.
- Layout uses logical properties only (`ms-`/`me-`/`ps-`/`pe-`, `start`/`end`); never `left`/`right`.
- Base text size 18px; main buttons at least 56px tall and full width on phones; every icon has a text label; no swipe, long-press, or hidden menus; WCAG AA contrast.
- Numbers in the UI use Eastern Arabic digits (١٢٣) through `toArabicDigits()`.
- Dates are Gregorian, formatted with `Intl.DateTimeFormat("ar", …)`.
- A person holds at most one juz' at a time per khatma.
- Members per khatma: 60. Rotation look-back: 3 rounds. Undo window: 10 seconds. Completion fires once all 30 are done and 10 seconds have passed since the most recent finish in the round.
- Schedule periods: `daily` 1 day, `every3days` 3 days, `weekly` 7 days, `biweekly` 14 days, `monthly` 30 days, `none` no target end. Yearly is never offered.
- Verification code: 10 characters from the 32-character alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, shown as `XXXX-XXXX-XX`, unique among pending verifications, single use, expires after 10 minutes. PIN for existing numbers: 6 digits, expires after 10 minutes, at most 5 attempts.
- **Every secret (verification codes, PINs, session tokens, alert tokens, invite codes, share tokens) is generated in an action or HTTP action with `crypto.getRandomValues`, never in a query or mutation** (Convex seeds randomness in queries and mutations). Only SHA-256 hashes of session tokens, alert tokens, and PINs are stored.
- Reader names appear only to members, only on "being read" tiles, and are never hidden for lateness. Done tiles never show a name.
- No third-party analytics. No secrets in the repo; all keys live in Convex or host environment variables.
- Convex deployment region: EU West (Ireland).
- Celebration duas are Quran 2:127 and 2:201, copied exactly with diacritics from Tanzil's Uthmani text, with their references shown.

## Review Focus

1. **Duplicate webhook delivery:** WhatsApp redelivers the same message (same message `id`); the second delivery must change nothing and send no second reply. Test in Task 5.
2. **Messy incoming text:** a forwarded or edited message with extra words, lowercase letters, missing dashes, or Arabic-Indic digits must still match its code; a message with no code gets one polite "send the ready-made message" reply. Test in Task 5.
3. **Two pending verifications for one number** (two browsers): a message carrying code A verifies only verification A; B stays pending until it expires. Test in Task 5.
4. **Display names:** whitespace-only, longer than 40 characters, or containing control characters must be rejected or trimmed, never stored raw. Test in Task 4.
5. **Dead invite links:** an unknown, reset, or malformed invite code shows a friendly "this link no longer works" page, not a crash or a blank screen. Test in Tasks 6 and 10.

---

## File structure

```
package.json                    pnpm workspace root; scripts: dev, typecheck, lint, test
pnpm-workspace.yaml             apps/*
convex.json                     functions dir: convex/
convex/
  schema.ts                     all tables (Task 3)
  lib/juz.ts                    30 ajza' metadata (Task 2)
  lib/schedule.ts               periods and target ends (Task 2)
  lib/text.ts                   digits, names, phone masking (Task 2)
  lib/crypto.ts                 random codes, SHA-256, HMAC (Task 2)
  lib/settings.ts               setting defaults + getSetting() (Task 3)
  lib/rateLimit.ts              fixed-window limiter on rateLimits table (Task 3)
  lib/session.ts                sessionQuery / sessionMutation wrappers (Task 4)
  people.ts, sessions.ts        identity (Task 4)
  verification.ts               start / status / claim / reject / confirmPin (Task 5)
  whatsapp.ts                   parseIncoming, sendText, handleIncoming (Task 5)
  http.ts                       webhook routes (Task 5)
  khatmas.ts                    create, view, myKhatmas (Task 6)
  pool.ts                       take, finish, undo, release, suggestion (Tasks 7-8)
  rounds.ts                     startRound, completeIfReady (Task 8)
  hooks.ts                      onRoundCompleted placeholder for plan 2 (Task 8)
  dev.ts                        internal dev helpers (Task 5)
  *.test.ts                     convex-test suites next to each module
apps/web/
  index.html, vite.config.ts, src/main.tsx, src/App.tsx (routes)
  src/i18n/ar.ts                every UI string
  src/lib/session.ts            token storage + useSessionToken()
  src/lib/whatsapp.ts           wa.me link builders + message texts
  src/styles.css                tokens from the prototype
  src/components/               Ring, Tile, PoolGrid, MainCard, Sheet, Toast, Button
  src/features/verify/          VerifySheet flow
  src/pages/                    KhatmaPage, HomePage, CreatePage, CelebrationPage, SignOutPage, NotFoundPage
```

---

### Task 1: Monorepo, Convex, and CI skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `convex.json`, `tsconfig.base.json`, `convex/tsconfig.json`, `vitest.config.ts`, `.github/workflows/ci.yml`, `.nvmrc` (`22`), `.gitignore` (add `.claude/worktrees/`, `node_modules`, `.env.local`, `dist`), `convex/smoke.test.ts`
- Modify: `README.md` (add "Development" section)

**Interfaces:**
- Produces: root scripts `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, `edge-runtime` environment for `convex/**`, `jsdom` for `apps/web/**`), `pnpm dev` (runs `convex dev` and the web dev server).

- [ ] **Step 1:** Initialise the workspace and add dev dependencies: `convex`, `convex-helpers`, `typescript`, `vitest`, `convex-test`, `@edge-runtime/vm`, `eslint`, `typescript-eslint`, `prettier`.
- [ ] **Step 2:** Run `npx convex dev --once --configure new` against a new Convex project named `silsila` in team Ali chooses, region **EU West (Ireland)**. Record the dev deployment name in `README.md` (not the deploy key).
- [ ] **Step 3: Write the failing test** `convex/smoke.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
test("convex-test boots with the schema", async () => {
  const t = convexTest(schema);
  expect(t).toBeDefined();
});
```

- [ ] **Step 4:** Run `pnpm test`. Expected: FAIL, `./schema` not found.
- [ ] **Step 5:** Add a minimal `convex/schema.ts` exporting `defineSchema({})`. Run `pnpm test`. Expected: PASS.
- [ ] **Step 6:** Add `ci.yml`: on pull request, run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` on Node 22. Push and confirm the workflow passes on the PR.
- [ ] **Step 7: Commit** `chore: scaffold monorepo, convex, and ci`.

---

### Task 2: Pure helpers (juz metadata, schedules, text, crypto)

**Files:**
- Create: `convex/lib/juz.ts`, `convex/lib/schedule.ts`, `convex/lib/text.ts`, `convex/lib/crypto.ts`
- Test: `convex/lib/juz.test.ts`, `convex/lib/schedule.test.ts`, `convex/lib/text.test.ts`, `convex/lib/crypto.test.ts`

**Interfaces:**
- Produces:
  - `JUZ: readonly { number: number; name: string; startSurah: string; startAyah: string }[]` (length 30; `startAyah` like `"2:142"`).
  - `type Schedule = "daily" | "every3days" | "weekly" | "biweekly" | "monthly" | "none"`; `SCHEDULES: readonly Schedule[]`; `periodMs(s: Schedule): number | null`; `targetEndFor(s: Schedule, startedAt: number): number | null`.
  - `toArabicDigits(v: number | string): string`; `normalizeDigits(s: string): string` (Arabic-Indic and Persian digits → ASCII); `cleanDisplayName(raw: string): string | null` (trim, collapse spaces, strip control characters, `null` if empty, cut to 40 characters); `maskPhone(e164: string): string` (country code, then the first 2 national digits, then ` ••• `, then the last 4; uses `libphonenumber-js` to find the country code).
  - `CODE_ALPHABET`; `randomCode(len: number): string`; `formatCode(code: string): string` (`XXXX-XXXX-XX`); `normalizeCode(s: string): string` (uppercase, drop non-alphabet characters); `randomToken(bytes: number): string` (base64url); `randomPin(): string` (6 digits); `sha256Hex(s: string): Promise<string>`; `hmacSha256Hex(key: string, body: string): Promise<string>`; `timingSafeEqual(a: string, b: string): boolean`.

- [ ] **Step 1: Write the failing tests:**

```ts
// juz.test.ts
expect(JUZ).toHaveLength(30);
expect(JUZ[0]).toEqual({ number: 1, name: "الم", startSurah: "الفاتحة", startAyah: "1:1" });
expect(JUZ[13]).toMatchObject({ number: 14, name: "ربما", startSurah: "الحجر", startAyah: "15:1" });
expect(JUZ[29]).toMatchObject({ number: 30, name: "عمّ", startSurah: "النبأ", startAyah: "78:1" });

// schedule.test.ts
expect(periodMs("weekly")).toBe(7 * 86_400_000);
expect(periodMs("monthly")).toBe(30 * 86_400_000);
expect(targetEndFor("none", 1000)).toBeNull();
expect(targetEndFor("daily", 1000)).toBe(1000 + 86_400_000);
expect(SCHEDULES).not.toContain("yearly");

// text.test.ts
expect(toArabicDigits(1430)).toBe("١٤٣٠");
expect(normalizeDigits("٤٨٢١ ۴")).toBe("4821 4");
expect(cleanDisplayName("   ")).toBeNull();
expect(cleanDisplayName("  أبو   علي \u0007")).toBe("أبو علي");
expect(cleanDisplayName("ا".repeat(60))).toHaveLength(40);
expect(maskPhone("+971501234567")).toBe("+971 50 ••• 4567");
expect(maskPhone("+249912345678")).toBe("+249 91 ••• 5678");

// crypto.test.ts
expect(randomCode(10)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
expect(formatCode("K7Q29XMB4T")).toBe("K7Q2-9XMB-4T");
expect(normalizeCode("رمز التحقق في سلسلة: k7q2 9xmb-4t ")).toBe("K7Q29XMB4T");
expect(randomPin()).toMatch(/^\d{6}$/);
expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
expect(timingSafeEqual("ab", "ab")).toBe(true);
expect(timingSafeEqual("ab", "ac")).toBe(false);
```

- [ ] **Step 2:** Add the `libphonenumber-js` dependency. Run `pnpm test convex/lib`. Expected: FAIL, modules not found.
- [ ] **Step 3:** Implement the four modules. `JUZ` names and start points (verify each `startAyah` against Tanzil's `quran-data.js` juz table before committing):
  1 الم 1:1 · 2 سيقول 2:142 · 3 تلك الرسل 2:253 · 4 لن تنالوا 3:93 · 5 والمحصنات 4:24 · 6 لا يحب الله 4:148 · 7 وإذا سمعوا 5:82 · 8 ولو أننا 6:111 · 9 قال الملأ 7:88 · 10 واعلموا 8:41 · 11 يعتذرون 9:93 · 12 وما من دابة 11:6 · 13 وما أبرئ 12:53 · 14 ربما 15:1 · 15 سبحان 17:1 · 16 قال ألم 18:75 · 17 اقترب 21:1 · 18 قد أفلح 23:1 · 19 وقال الذين 25:21 · 20 أمّن خلق 27:56 · 21 اتل ما أوحي 29:46 · 22 ومن يقنت 33:31 · 23 وما لي 36:28 · 24 فمن أظلم 39:32 · 25 إليه يرد 41:47 · 26 حم 46:1 · 27 قال فما خطبكم 51:31 · 28 قد سمع 58:1 · 29 تبارك 67:1 · 30 عمّ 78:1. `startSurah` is the Arabic surah name of the surah in `startAyah`. `randomCode` uses rejection sampling over `crypto.getRandomValues` (no modulo bias). `maskPhone` follows the format above.
- [ ] **Step 4:** Run `pnpm test convex/lib`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add juz metadata, schedule, text, and crypto helpers`.

---

### Task 3: Schema, settings defaults, and rate limiter

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/settings.ts`, `convex/lib/rateLimit.ts`, `convex/maintenance.ts`, `convex/crons.ts`
- Test: `convex/lib/settings.test.ts`, `convex/lib/rateLimit.test.ts`, `convex/maintenance.test.ts`

**Interfaces:**
- Produces tables (all with `v.` validators; `Id<"…">` references):
  - `people`: `phone` (E.164), `displayName`, `verifiedAt`, `timeZone`. Index `by_phone`.
  - `sessions`: `personId`, `tokenHash`, `alertTokenHash`, `deviceLabel`, `createdAt`, `lastUsedAt`. Indexes `by_tokenHash`, `by_alertTokenHash`, `by_person`.
  - `verifications`: `codeNormalized`, `secretHash`, `displayName`, `status` (`"pending" | "matched" | "needs_pin" | "claimed" | "rejected" | "expired"`), `phone?`, `pinHash?`, `pinAttempts`, `existingPersonId?`, `createdAt`, `expiresAt`. Indexes `by_code_status` (`codeNormalized`, `status`).
  - `inboundMessages`: `waMessageId`, `receivedAt`. Index `by_waMessageId`.
  - `khatmas`: `name` (string | null), `schedule`, `creatorPersonId`, `inviteCode`, `currentRoundId?`, `completedRounds`, `createdAt`. Index `by_inviteCode`.
  - `members`: `khatmaId`, `personId`, `joinedAt`, `shareToken?`, `status` (`"active" | "blocked"`), `nudgesOn`, `lastCelebratedRound`. Indexes `by_khatma`, `by_person`, `by_khatma_person`, `by_shareToken`.
  - `rounds`: `khatmaId`, `number`, `startedAt`, `targetEndAt` (number | null), `completedAt` (number | null), `lastFinishedAt` (number | null). Index `by_khatma_number`.
  - `assignments`: `khatmaId`, `roundId`, `roundNumber`, `juz`, `memberId`, `personId`, `takenAt`, `finishedAt` (number | null), `releasedAt` (number | null), `releasedBySystem`. Indexes `by_round_juz`, `by_khatma_person`, `by_round`.
  - `settings`: `key`, `value` (`v.any()`), `updatedAt`. Index `by_key`.
  - `rateLimits`: `key`, `windowStart`, `count`. Index `by_key`.
- Produces `SETTING_DEFAULTS` (object) and `getSetting<K extends keyof typeof SETTING_DEFAULTS>(ctx: QueryCtx, key: K): Promise<(typeof SETTING_DEFAULTS)[K]>`.
- Produces `checkRateLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number): Promise<boolean>` (`true` = allowed, and counts the hit) and `checkShardedRateLimit` (same signature).
- Produces `internal.maintenance.purge` and `convex/crons.ts`.

- [ ] **Step 1: Write the failing tests:**

```ts
// settings.test.ts
test("falls back to defaults", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    expect(await getSetting(ctx, "maxMembers")).toBe(60);
    expect(await getSetting(ctx, "rotationLookbackRounds")).toBe(3);
    expect(await getSetting(ctx, "undoWindowMs")).toBe(10_000);
  });
});
test("stored value wins", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    await ctx.db.insert("settings", { key: "maxMembers", value: 40, updatedAt: 0 });
    expect(await getSetting(ctx, "maxMembers")).toBe(40);
  });
});

// rateLimit.test.ts
test("allows `limit` hits per window", async () => {
  const t = convexTest(schema);
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(ctx, "k", 3, 60_000)).toBe(true);
    expect(await checkRateLimit(ctx, "k", 3, 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `pnpm test convex/lib`. Expected: FAIL.
- [ ] **Step 3:** Implement. `SETTING_DEFAULTS`: `maxMembers: 60`, `rotationLookbackRounds: 3`, `undoWindowMs: 10_000`, `completionDelayMs: 10_000`, `verificationTtlMs: 600_000`, `pinMaxAttempts: 5`, `verifyStartPerClientPer10Min: 5`, `verifyPerPhonePerHour: 10`, `verifyGlobalPerMinute: 120`, `poolActionsPerPersonPerMinute: 10` (take, finish, undo, release combined), `createsPerPersonPerDay: 5`, `newMembersPerKhatmaPerHour: 30`, `maintenanceMode: false`, `announcement: null`. `checkRateLimit` uses a fixed window: reset `count` when `now - windowStart >= windowMs`. Global limits use `checkShardedRateLimit(ctx, key, limit, windowMs)`, which picks one of 10 shard keys (`${key}:${0..9}`) at random and allows `ceil(limit / 10)` per shard, so concurrent calls don't all write one document.

  Add `convex/crons.ts` with a daily job `internal.maintenance.purge` (in `convex/maintenance.ts`) that deletes `rateLimits` rows whose `windowStart` is more than 24 hours old (spec 9 keeps IP addresses at most 24 hours), `inboundMessages` older than 7 days, and `verifications` older than 24 hours (they hold phone numbers). Test it: insert rows aged 25 hours and 1 hour, run the job, and expect only the 1-hour rows to remain.
- [ ] **Step 4:** Run `pnpm test convex/lib`. Expected: PASS. Run `npx convex dev --once` and confirm the schema deploys.
- [ ] **Step 5: Commit** `feat: add schema, settings defaults, and rate limiter`.

---

### Task 4: Sessions and session-aware functions

**Files:**
- Create: `convex/lib/session.ts`, `convex/sessions.ts`, `convex/people.ts`
- Test: `convex/sessions.test.ts`

**Interfaces:**
- Consumes: `sha256Hex`, `randomToken`, `cleanDisplayName` (Task 2); tables (Task 3).
- Produces:
  - `sessionQuery` / `sessionMutation` (built with `convex-helpers` `customQuery`/`customMutation`): add optional arg `sessionToken: v.optional(v.string())`, and put `ctx.person: Doc<"people"> | null` and `ctx.session: Doc<"sessions"> | null` on the context. An unknown token yields `null`, never an error.
  - `requirePerson(ctx): Doc<"people">` throws `ConvexError({ code: "not_signed_in" })`.
  - `internal.sessions.create({ personId, tokenHash, alertTokenHash, deviceLabel }): Id<"sessions">`.
  - `api.sessions.me` (sessionQuery) → `{ displayName: string; maskedPhone: string } | null`.
  - `api.sessions.signOut` (sessionMutation) deletes the current session.
  - `api.sessions.signOutOthersByAlertToken` (mutation, `{ alertToken: string; sessionToken?: string }`) → `{ ok: boolean }`: deletes every session of that person except the caller's own session, when `sessionToken` belongs to the same person and isn't the session the alert was sent for. Opened without a session (for example in WhatsApp's in-app browser), it deletes all of them.
  - `api.sessions.list` (sessionQuery) → `{ sessionId: Id<"sessions">; deviceLabel: string; lastUsedAt: number; isCurrent: boolean }[]`.
  - `api.sessions.signOutOthers` (sessionMutation) deletes every other session of the caller. `api.sessions.signOutOne` (sessionMutation, `{ sessionId }`) deletes one of the caller's sessions.
  - `api.people.updateDisplayName` (sessionMutation, `{ displayName: string }`), rejects with `ConvexError({ code: "invalid_name" })` when `cleanDisplayName` returns `null`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("me returns null without a session and the person with one", async () => {
  const t = convexTest(schema);
  expect(await t.query(api.sessions.me, {})).toBeNull();
  const token = "tok_1";
  await t.run(async (ctx) => {
    const personId = await ctx.db.insert("people", { phone: "+971501234567", displayName: "علي", verifiedAt: 0, timeZone: "Asia/Dubai" });
    await ctx.db.insert("sessions", { personId, tokenHash: await sha256Hex(token), alertTokenHash: await sha256Hex("al_1"), deviceLabel: "iPhone Safari", createdAt: 0, lastUsedAt: 0 });
  });
  expect(await t.query(api.sessions.me, { sessionToken: token })).toEqual({ displayName: "علي", maskedPhone: "+971 50 ••• 4567" });
  expect(await t.query(api.sessions.me, { sessionToken: "wrong" })).toBeNull();
});
test("alert link keeps the owner's own session and removes the rest", async () => { /* sessions S1 (owner, token tok_1) and S2 (alert al_2, the new sign-in); signOutOthersByAlertToken({ alertToken: "al_2", sessionToken: "tok_1" }) → only S1 remains; without sessionToken → none remain */ });
test("list marks the current session and signOutOthers keeps it", async () => {});
test("updateDisplayName rejects blank names", async () => { /* expect rejects with code invalid_name for "   " */ });
```

- [ ] **Step 2:** Run `pnpm test convex/sessions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `sessionQuery` must not write (`lastUsedAt` is updated only in `sessionMutation`, at most once per hour per session).
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add phone-based sessions`.

---

### Task 5: WhatsApp verification backend

**Files:**
- Create: `convex/verification.ts`, `convex/whatsapp.ts`, `convex/http.ts`, `convex/dev.ts`
- Test: `convex/verification.test.ts`, `convex/whatsapp.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4.
- Env vars (Convex): `WHATSAPP_PUBLIC_NUMBER` (digits only, used in `wa.me`), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_VERSION`, `SITE_URL`, and `SILSILA_ENV` (`"dev"` or `"prod"`, required). In `dev`, `sendText` logs the message instead of sending when `WHATSAPP_ACCESS_TOKEN` is unset. In `prod`, a missing WhatsApp variable makes `startInternal` return `whatsapp_not_configured`, and `sendText` never logs message bodies (they contain PINs and sign-out links).
- Produces:
  - `POST /api/verification/start` (HTTP action, JSON body `{ displayName: string; clientKey: string }`, CORS allows only `SITE_URL` and `http://localhost:5173`) → 200 `{ verificationId: Id<"verifications">; secret: string; code: string /* formatted */; waNumber: string; message: string }`, or 4xx `{ error: "invalid_name" | "rate_limited" | "maintenance" | "whatsapp_not_configured" }`. `message` is exactly `رمز التحقق في سلسلة: ${code}`. It's an HTTP action rather than a client-called action so it can read the caller's IP for rate limiting. The logic lives in `internal.verification.startInternal` (internal action, `{ displayName, clientKey, ip: string | null }`) so tests can call it directly.
  - `api.verification.status` (query, `{ verificationId, secret }`) → `{ status: "pending" | "matched" | "needs_pin" | "claimed" | "rejected" | "expired"; maskedPhone: string | null }`. Wrong secret → `{ status: "expired", maskedPhone: null }`.
  - `api.verification.claim` (action, `{ verificationId, secret, deviceLabel, timeZone }`) → `{ sessionToken: string } | { error: "expired" | "needs_pin" }`; allowed only from `matched` and before `expiresAt`. At claim time it re-checks whether the phone now belongs to a person. If it does (someone registered that number since the message arrived), it moves the verification to `needs_pin`, sends a PIN, and returns `needs_pin`; it never attaches a session to an existing person without the PIN.
  - `api.verification.confirmPin` (action, `{ verificationId, secret, pin, deviceLabel, timeZone }`) → `{ sessionToken: string } | { error: "wrong_pin" | "too_many_attempts" | "expired" }`; checks `expiresAt` first.
  - `internal.verification.expire({ verificationId })`: sets `expired` if the status is still `pending`, `matched`, or `needs_pin`. `startInternal` schedules it at `expiresAt`; moving to `needs_pin` sets a fresh `expiresAt` (now + 10 minutes) and schedules it again. This makes the live `status` query change on time.
  - `internal.whatsapp.recordInbound({ waMessageId })` (internal mutation) → `boolean`: inserts the ID and returns `true` only if it wasn't already there. One mutation, so concurrent redeliveries can't both pass.
  - `api.verification.reject` (mutation, `{ verificationId, secret }`): "not my number"; sets `rejected`.
  - `parseIncoming(payload: unknown): { waMessageId: string; from: string; text: string }[]` (pure, in `whatsapp.ts`).
  - `internal.whatsapp.handleIncoming` (internal action, `{ waMessageId, from, text }`).
  - `internal.whatsapp.sendText` (internal action, `{ to: string; body: string }`).
  - HTTP routes: `GET /whatsapp/webhook` (Meta verify handshake using `WHATSAPP_VERIFY_TOKEN`), `POST /whatsapp/webhook` (verifies `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`; returns 401 on mismatch, 200 otherwise, and schedules `handleIncoming` per message).
  - `internal.dev.simulateIncoming` (internal action, `{ from: string; text: string }`): calls `handleIncoming` with a random message ID. Run with `npx convex run dev:simulateIncoming '{"from":"971501234567","text":"…"}'`.

`handleIncoming` rules:
1. Call `recordInbound`; if it returns `false`, stop (no reply).
2. Rate-limit per phone (`verifyPerPhonePerHour`); over the limit, stop without replying.
3. Find a `pending` verification by `normalizeCode(normalizeDigits(text))` containing a 10-character code; check it isn't expired. No match → reply once: `لم نجد رمز تحقق صالحاً. ارجع إلى سلسلة واضغط «تحقّق عبر واتساب» ثم أرسل الرسالة الجاهزة كما هي.`
4. Phone `+${from}` has no `people` row → status `matched`, store `phone`. Reply `تمّ التحقق ✅ ارجع إلى سلسلة لتكمل.`
5. Phone already has a person → generate the PIN in the action, then one internal mutation moves the verification from `pending` to `needs_pin` (storing `pinHash` and `existingPersonId`) only if it is still `pending`, and returns whether it did. Send the reply only when it did. Reply `رمز الدخول إلى سلسلة: ${pin}\nلا تشاركه مع أحد.`

On a successful `claim` or `confirmPin`: create the person if new (with `displayName` and `timeZone`), create the session (token and alert token from `randomToken(32)`), set status `claimed`, and send `تسجيل دخول جديد إلى سلسلة من ${deviceLabel}. إن لم تكن أنت، اضغط هنا لتسجيل الخروج من الأجهزة الأخرى: ${SITE_URL}/signout?t=${alertToken}`.

- [ ] **Step 1: Write the failing tests** (`whatsapp.test.ts` for `parseIncoming`; `verification.test.ts` for the flows; mock `sendText` by checking the scheduled internal calls, or stub `fetch` with `vi.stubGlobal`):

```ts
test("parseIncoming extracts text messages", () => {
  expect(parseIncoming(sampleWebhook /* one text message from 971501234567 */)).toEqual([{ waMessageId: "wamid.1", from: "971501234567", text: "رمز التحقق في سلسلة: K7Q2-9XMB-4T" }]);
  expect(parseIncoming({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([]);
});
test("start over HTTP returns a formatted code and the ready-made message", async () => { /* t.fetch("/api/verification/start", POST JSON) → code matches /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/, message === `رمز التحقق في سلسلة: ${code}` */ });
test("new number: start → message → matched → claim → session", async () => { /* start; simulate message with code; status = matched with maskedPhone "+971 50 ••• 4567"; claim → sessionToken; sessions.me returns the displayName */ });
test("existing number needs the PIN from the WhatsApp reply", async () => { /* existing person; start; message; status = needs_pin; claim rejects; confirmPin with wrong pin → wrong_pin; with the sent pin → sessionToken */ });
test("five wrong PINs lock the verification", async () => { /* 5x wrong_pin, 6th → too_many_attempts */ });
test("duplicate webhook delivery is ignored", async () => { /* handleIncoming twice with same waMessageId → one reply sent, state unchanged */ });
test("messy text still matches", async () => { /* text "تفضل k7q2 9xmb 4t شكراً" matches code K7Q29XMB4T */ });
test("a message matches only its own verification", async () => { /* two pending for one phone; message with code A → A matched, B pending */ });
test("expired codes don't match", async () => { /* advance time 10 min + 1 ms with vi.setSystemTime → no match, polite reply */ });
test("webhook rejects a bad signature", async () => { /* t.fetch("/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": "sha256=00" }, body }) → 401 */ });
test("reject marks the verification rejected and claim then fails", async () => {});
test("a stale matched verification cannot sign in to an account created later", async () => { /* V1 matched for +971501234567 (no person yet); V2 for the same phone completes claim (person created); claim(V1) → { error: "needs_pin" } and a PIN reply is sent; no new session exists */ });
test("claim after expiry fails", async () => { /* matched, then advance 10 min + 1 ms → { error: "expired" } */ });
test("an unanswered verification becomes expired on time", async () => { /* start; run scheduled functions at +10 min → status "expired" */ });
test("concurrent redelivery sends one PIN", async () => { /* existing person; run handleIncoming twice in parallel (Promise.all) with the same waMessageId → exactly one sendText call */ });
test("prod without WhatsApp config refuses to start", async () => { /* SILSILA_ENV=prod, no token → error whatsapp_not_configured */ });
```

- [ ] **Step 2:** Run `pnpm test convex/verification.test.ts convex/whatsapp.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Secrets come only from actions (`startInternal`, `claim`, `confirmPin`, `handleIncoming`), which call internal mutations to write. `startInternal` rate-limits by `clientKey` (`verifyStartPerClientPer10Min`), by `ip` with the same limit when it isn't null, and globally (`verifyGlobalPerMinute`); it retries code generation if the code collides with a pending one. The HTTP route takes `ip` from the first address in `X-Forwarded-For`. Deploy once and log whether Convex supplies that header; if it doesn't, `ip` is null, and the PR description must say so.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Manual check in dev: run `start` from the Convex dashboard, then `npx convex run dev:simulateIncoming` with the code; confirm `status` turns `matched` and the logged reply text is exact.
- [ ] **Step 6: Commit** `feat: add whatsapp reverse verification`.

---

### Task 6: Create and view a khatma

**Files:**
- Create: `convex/khatmas.ts`
- Test: `convex/khatmas.test.ts`

**Interfaces:**
- Consumes: Tasks 2-5; `internal.rounds.startRound` (Task 8 produces it; in this task, create the first round with an inline insert through a shared helper `insertRound(ctx, khatmaId, number, startedAt)` in `convex/rounds.ts`, which Task 8 reuses).
- Produces:
  - `api.khatmas.create` (action, `{ sessionToken, name: string | null, schedule: Schedule }`) → `{ inviteCode: string }`. Requires a person. `inviteCode` = `randomToken(9)`. Creates the khatma, round 1, and the creator's membership with `shareToken = randomToken(8)`.
  - `api.khatmas.view` (sessionQuery, `{ inviteCode: string; from?: string }`) → `KhatmaView | { notFound: true }`:

```ts
type TileView = { juz: number; name: string; state: "open" | "reading" | "done"; readerName: string | null; isMine: boolean };
type KhatmaView = {
  khatmaId: Id<"khatmas">; name: string | null; createdAt: number; schedule: Schedule;
  roundNumber: number; targetEndAt: number | null; completedRounds: number; memberCount: number;
  lastCompleted: { roundNumber: number; participants: number } | null; // participants = distinct people who finished a juz' in that round
  inviterName: string | null;               // only when `from` is a valid share token of an active member
  tiles: TileView[];                         // always 30, ordered by juz
  me: { signedIn: boolean; isMember: boolean; holding: number | null; suggestion: number | null; celebrateRound: number | null };
};
```

  - `api.khatmas.mine` (sessionQuery) → `{ inviteCode; name; createdAt; schedule; done: number; holding: number | null }[]` for active memberships, newest first.
  - `api.khatmas.ensureShareToken` (action, `{ sessionToken, inviteCode }`) → `{ shareToken: string }`; creates one for the member if missing.

- [ ] **Step 1: Write the failing tests:**

```ts
test("create returns an invite code and makes the creator a member", async () => { /* signed-in person; create({ name: null, schedule: "weekly" }); view → roundNumber 1, targetEndAt = startedAt + 7 days, me.isMember true, 30 open tiles */ });
test("create requires a session", async () => { /* expect rejects not_signed_in */ });
test("viewers see states but no names", async () => { /* member A holds juz 15; view without session → tile 15 state "reading", readerName null */ });
test("members see reader names on reading tiles only", async () => { /* A holds 15, A finished 3; member B views → tile 15 readerName "A", tile 3 readerName null */ });
test("inviterName requires a valid share token", async () => { /* from = A's token → "A"; from = "nope" → null */ });
test("unknown invite code returns notFound", async () => { /* view({ inviteCode: "zzz" }) → { notFound: true } */ });
test("schedule none has no target end", async () => {});
test("lastCompleted counts distinct participants", async () => { /* round 1 finished by 3 people (one finished 20 ajza') → participants 3 */ });
```

- [ ] **Step 2:** Run `pnpm test convex/khatmas.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Tile state derives from the current round's assignments: finished → `done`; neither finished nor released → `reading`; else `open`. `me.suggestion` comes from `suggestJuz` (Task 7); until Task 7 lands, return the lowest open juz. `me.celebrateRound` = `completedRounds` when the viewer is a member and `member.lastCelebratedRound < completedRounds`, else `null`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: create and view khatmas`.

---

### Task 7: Take a juz' (rotation, one at a time, cap, race)

**Files:**
- Create: `convex/pool.ts`
- Test: `convex/pool.take.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6.
- Produces:
  - `suggestJuz(ctx: QueryCtx, khatmaId: Id<"khatmas">, personId: Id<"people"> | null): Promise<number | null>`: the lowest-numbered open juz' that this person didn't finish in **their own** last `rotationLookbackRounds` rounds in this khatma (the most recent rounds in which they finished at least one juz', per spec 3.5); otherwise the lowest open; `null` if none open.
  - `api.pool.take` (sessionMutation, `{ inviteCode: string; juz: number }`) → `{ ok: true } | { ok: false; reason: "taken" | "already_holding" | "khatma_full" | "blocked" | "maintenance" | "rate_limited" }`. Throws `not_signed_in` without a session. Creates the membership on first take with `lastCelebratedRound = khatma.completedRounds` (so a newcomer never sees a celebration for a round they didn't join); `shareToken` stays empty until `ensureShareToken`. Rate limits: `poolActionsPerPersonPerMinute` per person, and `newMembersPerKhatmaPerHour` for new memberships; over a limit returns `{ ok: false; reason: "rate_limited" }`.
  - `KhatmaView.me.suggestion` now uses `suggestJuz`.

- [ ] **Step 1: Write the failing tests:**

```ts
test("take marks the juz reading and makes the person a member", async () => {});
test("second take while holding returns already_holding", async () => {});
test("taking a taken juz returns taken", async () => { /* A takes 14; B take 14 → { ok: false, reason: "taken" } */ });
test("the 61st person gets khatma_full", async () => { /* 60 active members; new person take → khatma_full; existing member still can take */ });
test("blocked member gets blocked", async () => {});
test("rotation skips ajza' finished in the last 3 rounds", async () => { /* person finished 1 in round 3 (current round 4) → suggestion 2; person who read in rounds 1, 5, 9 and finished juz 1 in round 1 (current round 12) → suggestion 2, because round 1 is among their own last 3 */ });
test("a newcomer to a khatma with 5 completed rounds sees no celebration", async () => { /* take → view.me.celebrateRound null */ });
test("the 11th pool action in a minute is rate_limited", async () => {});
test("juz outside 1..30 is rejected", async () => { /* take({ juz: 31 }) rejects with ConvexError invalid_juz */ });
```

- [ ] **Step 2:** Run `pnpm test convex/pool.take.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. The "taken" and "already_holding" checks read inside the same mutation, so Convex's serializable transactions guarantee one winner.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: take a juz with rotation and limits`.

---

### Task 8: Finish, undo, release, and completion

**Files:**
- Modify: `convex/pool.ts`
- Create: `convex/rounds.ts`, `convex/hooks.ts`
- Test: `convex/pool.finish.test.ts`, `convex/rounds.test.ts`

**Interfaces:**
- Consumes: Tasks 6-7.
- Produces:
  - `api.pool.finish` (sessionMutation, `{ inviteCode }`) → `{ ok: true; undoUntil: number } | { ok: false; reason: "not_holding" }`. Sets `finishedAt = now`, `round.lastFinishedAt = now`. When the round now has 30 done, schedule `internal.rounds.completeIfReady({ roundId })` at `now + completionDelayMs`.
  - `api.pool.undoFinish` (sessionMutation, `{ inviteCode }`) → `{ ok: true } | { ok: false; reason: "window_closed" | "holding_another" | "round_completed" }`; refuses with `holding_another` when the caller already holds another juz' in this khatma (one at a time); allowed only for the caller's most recent finished assignment in the current round, within `undoWindowMs`, and only while the round isn't completed. Sets `finishedAt = null` (the juz' is held again).
  - `api.pool.release` (sessionMutation, `{ inviteCode }`) → `{ ok: boolean }`; sets `releasedAt = now`, `releasedBySystem = false`.
  - `api.khatmas.markCelebrated` (sessionMutation, `{ inviteCode }`) sets `lastCelebratedRound = completedRounds`.
  - `internal.rounds.completeIfReady({ roundId })`: no-op unless all 30 juz' are done, `completedAt` is null, and `now >= lastFinishedAt + completionDelayMs`. Otherwise sets `completedAt`, increments `khatma.completedRounds`, inserts the next round with `startedAt = now` and `targetEndAt = targetEndFor(schedule, now)`, sets `currentRoundId`, and calls `onRoundCompleted(ctx, khatmaId, roundNumber)`.
  - `onRoundCompleted(ctx: MutationCtx, khatmaId: Id<"khatmas">, roundNumber: number): Promise<void>` in `convex/hooks.ts`: empty in this plan; plan 2 adds push notifications.

- [ ] **Step 1: Write the failing tests:**

```ts
test("finish then undo within 10s restores the hold", async () => {});
test("undo after 10s is rejected", async () => { /* vi.setSystemTime(+10_001) → { ok: false, reason: "window_closed" } */ });
test("undo is refused after taking another juz", async () => { /* finish 12, take 13 within 10s, undo → { ok: false, reason: "holding_another" }; 12 stays done */ });
test("release reopens the juz without naming anyone", async () => { /* after release, viewer and members see tile state "open", readerName null */ });
test("30th finish completes the round 10s later and starts the next", async () => { /* 29 done + finish 30th; run scheduled functions at +10s (t.finishAllScheduledFunctions with vi timers); round 1 completedAt set, completedRounds 1, view.roundNumber 2, all 30 open */ });
test("undo of an earlier finish cancels a pending completion", async () => { /* A finishes 29 at t0, B finishes 30 at t0+5s, A undoes at t0+8s → at t0+15s round not completed */ });
test("a finish 5s after another delays completion to the later finish + 10s", async () => {});
test("completion runs once even if scheduled twice", async () => {});
test("members see celebrateRound until markCelebrated", async () => {});
```

- [ ] **Step 2:** Run `pnpm test convex/pool.finish.test.ts convex/rounds.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `vi.useFakeTimers()` with `t.finishAllScheduledFunctions(vi.runAllTimers)` in tests.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: finish, undo, release, and round completion`.

---

### Task 9: Web app skeleton (RTL, design tokens, Convex, sessions)

**Files:**
- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/src/i18n/ar.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/components/Button.tsx`, `apps/web/public/manifest.webmanifest`
- Test: `apps/web/src/lib/session.test.ts`, `apps/web/src/lib/format.test.ts`

**Interfaces:**
- Consumes: Convex generated `api` via the path alias `@convex/_generated/api`.
- Produces:
  - `t: typeof ar` (import `{ t } from "../i18n/ar"`); keys are added by the tasks that need them.
  - `getSessionToken(): string | null`, `setSessionToken(token: string): void`, `clearSessionToken(): void` (key `silsila.session`), `getClientKey(): string` (random, created once, key `silsila.client`), `useSessionToken(): string | undefined` (`undefined` when signed out; reacts to `storage` events).
  - `formatDate(ms: number): string` with `Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" })`; `deviceLabel(ua: string): string` (e.g. `"iPhone · Safari"`, `"Android · Chrome"`).
  - Routes: `/` → HomePage, `/new` → CreatePage, `/j/:inviteCode` → KhatmaPage, `/signout` → SignOutPage, `*` → NotFoundPage (stubs in this task).
  - `<Button variant="primary" | "ghost" | "whatsapp" | "gold">` with min height 62px (primary) / 56px (others), full width.

- [ ] **Step 1: Write the failing tests:**

```ts
expect(getSessionToken()).toBeNull(); setSessionToken("x"); expect(getSessionToken()).toBe("x");
expect(getClientKey()).toBe(getClientKey());
expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) … Safari/604.1")).toBe("iPhone · Safari");
expect(formatDate(Date.UTC(2026, 9, 30, 12))).toContain("أكتوبر");
```

- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement. `index.html` has `lang="ar" dir="rtl"`, loads Readex Pro, Aref Ruqaa, and Amiri Quran from Google Fonts with `display=swap`. `styles.css` defines the prototype palette as CSS variables (`--paper #F5EFE3`, `--paper-2 #EDE3D0`, `--card #FBF8F1`, `--ink #1C2924`, `--ink-soft #4E5B55`, `--line #D8CCB4`, `--green #1F5A45`, `--green-deep #133A2D`, `--saffron #C98A1E`, `--saffron-soft #F6E4BD`, `--saffron-ink #5E4108`, `--gold #D9A93F`, `--wa #17834A`), exposed to Tailwind v4 through `@theme`, plus the 8-point-star background pattern from the prototype. `main.tsx` wraps the app in `ConvexProvider` with `VITE_CONVEX_URL`.
- [ ] **Step 4:** Run tests (PASS), then `pnpm --filter web dev` and confirm the empty Arabic shell renders right-to-left with the paper background.
- [ ] **Step 5: Commit** `feat: add rtl web app skeleton`.

---

### Task 10: Khatma page (ring, pool grid, main card)

**Files:**
- Create: `apps/web/src/components/Ring.tsx`, `Tile.tsx`, `PoolGrid.tsx`, `MainCard.tsx`, `apps/web/src/pages/KhatmaPage.tsx`, `apps/web/src/pages/NotFoundPage.tsx`
- Test: `apps/web/src/components/Tile.test.tsx`, `Ring.test.tsx`, `MainCard.test.tsx`, `apps/web/src/pages/KhatmaPage.test.tsx`

**Interfaces:**
- Consumes: `KhatmaView`, `TileView` (Task 6); `api.khatmas.view`; `t`, `toArabicDigits` (re-export from `@convex/lib/text`), `formatDate`.
- Produces:
  - `<Ring tiles={TileView[]} gold?: boolean />`: 30 beads, green done, saffron reading, dashed open; center shows done count and `من ٣٠ جزءاً تمّت`; `aria-label` = `"تمّ ١٧ من ٣٠ جزءاً"`.
  - `<Tile tile={TileView} onTake={(juz) => void} />`: open tiles are buttons; reading and done tiles are disabled. State is shown as a word, not color alone.
  - `<PoolGrid tiles onTake />`: 3 columns, legend.
  - `<MainCard view={KhatmaView} onTake onFinish onRelease />`: holding → held card with juz number, name, `يبدأ من سورة ${startSurah}`, "أتممتُ القراءة" primary, "لا أستطيع إكماله" ghost; not holding with a suggestion → "خذ جزءاً" plus `نقترح عليك الجزء ${n} «${name}»`; nothing open → "كل الأجزاء مأخوذة الآن".
  - `KhatmaPage` reads `inviteCode` and `from` from the URL. Shows the viewer ribbon `دعاك ${inviterName} إلى هذه الختمة…` when not a member, the title (`name` or `ختمة ${formatDate(createdAt)}`), chips (round, schedule label, target end), Ring, MainCard, PoolGrid, then the group total `ختمتم معاً ${completedRounds} ختمة، الحمد لله` when `completedRounds > 0`. `{ notFound: true }` renders `NotFoundPage` with `هذا الرابط لم يعد يعمل. اطلب من صاحب الدعوة رابطاً جديداً.`

- [ ] **Step 1: Write the failing tests:**

```tsx
test("reading tile shows the reader name and is disabled", () => {
  render(<Tile tile={{ juz: 15, name: "سبحان", state: "reading", readerName: "فاطمة", isMine: false }} onTake={vi.fn()} />);
  expect(screen.getByRole("button", { name: /الجزء ١٥/ })).toBeDisabled();
  expect(screen.getByText("فاطمة")).toBeInTheDocument();
});
test("done tile never shows a name", () => { /* readerName ignored; text "تمّ ✓" */ });
test("open tile calls onTake", async () => { /* click → onTake(14) */ });
test("ring labels its progress", () => { /* 17 done → aria-label "تمّ ١٧ من ٣٠ جزءاً" */ });
test("main card shows the suggestion", () => { /* suggestion 19 → "نقترح عليك الجزء ١٩ «وقال الذين»" */ });
test("KhatmaPage shows the not-found message for notFound", () => { /* mock useQuery → { notFound: true } */ });
test("no left/right classes in components", () => { /* read component sources; expect no /\b(ml|mr|pl|pr|left|right)-/ */ });
```

- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement, matching the prototype's look (it lives at `~/.t3/scratch/2026-10-26-i-want-to-build-a-e9db1972/prototype/index.html` on Ali's machine; the screenshots in the design PR are the reference if it's unavailable). Mock `convex/react` `useQuery` in page tests.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: khatma page with ring and pool grid`.

---

### Task 11: Verify flow in the web app

**Files:**
- Create: `apps/web/src/features/verify/VerifySheet.tsx`, `apps/web/src/features/verify/useVerification.ts`, `apps/web/src/components/Sheet.tsx`, `apps/web/src/lib/whatsapp.ts`
- Test: `apps/web/src/features/verify/useVerification.test.ts`, `apps/web/src/lib/whatsapp.test.ts`

**Interfaces:**
- Consumes: Task 5 functions (`start` is called with `fetch(`${VITE_CONVEX_SITE_URL}/api/verification/start`)`; the rest through the Convex client); Task 9 session helpers.
- Produces:
  - `waLink(number: string, text: string): string` → `https://wa.me/${number}?text=${encodeURIComponent(text)}`; `waShareLink(text: string): string` → `https://wa.me/?text=…`.
  - `useVerification(): { step: "name" | "waiting" | "confirm" | "pin" | "done" | "error"; maskedPhone: string | null; error: string | null; start(name: string): Promise<void>; confirm(): Promise<void>; notMe(): Promise<void>; submitPin(pin: string): Promise<void>; reopenWhatsApp(): void }`. Maps statuses: `pending` → waiting, `matched` → confirm, `needs_pin` → pin, `claimed` → done, `expired`/`rejected` → error with a retry. If `claim` returns `needs_pin`, go to the pin step.
  - `<VerifySheet title onVerified={() => void} />` steps: name field + "تحقّق عبر واتساب" (opens `waLink` in a new tab) → waiting spinner with "افتح واتساب مرة أخرى" → confirm `تمّ التحقق، أهلاً ${name}` with the masked number in an `dir="ltr"` span, "نعم، هذا رقمي" / "ليس رقمي" → or PIN entry (6 boxes, `inputMode="numeric"`, `autocomplete="one-time-code"`) with `أرسلنا لك رمزاً على واتساب`.
  - KhatmaPage: tapping take while signed out opens `VerifySheet`, and after `onVerified` opens the take sheet for the same juz'.

- [ ] **Step 1: Write the failing tests:**

```ts
expect(waLink("971500000000", "رمز التحقق في سلسلة: K7Q2-9XMB-4T")).toBe("https://wa.me/971500000000?text=%D8%B1%D9%85%D8%B2%20%D8%A7%D9%84%D8%AA%D8%AD%D9%82%D9%82%20%D9%81%D9%8A%20%D8%B3%D9%84%D8%B3%D9%84%D8%A9%3A%20K7Q2-9XMB-4T");
test("status matched moves to confirm, and confirm stores the token", async () => { /* mock useAction/useQuery; after confirm → getSessionToken() === "tok" and step === "done" */ });
test("needs_pin moves to pin and wrong pin shows an error", async () => {});
test("blank name shows the name error and doesn't call start", async () => {});
```

- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Pass `deviceLabel(navigator.userAgent)` and `Intl.DateTimeFormat().resolvedOptions().timeZone` to `claim`/`confirmPin`.
- [ ] **Step 4:** Run tests. Expected: PASS. Then run the full flow in the browser against dev Convex, using `npx convex run dev:simulateIncoming` in place of WhatsApp.
- [ ] **Step 5: Commit** `feat: whatsapp verification flow in the web app`.

---

### Task 12: Take, finish, undo, release, and celebration in the web app

**Files:**
- Create: `apps/web/src/components/Toast.tsx`, `apps/web/src/pages/CelebrationPage.tsx`
- Modify: `apps/web/src/pages/KhatmaPage.tsx`
- Test: `apps/web/src/pages/KhatmaPage.actions.test.tsx`, `apps/web/src/pages/CelebrationPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 7-8 mutations; Task 10 components.
- Produces:
  - Take sheet: large juz' number and name, `يبدأ من سورة …`, "نعم، هذا جزئي" / "ليس الآن". Result `taken` → toast `سبقك أحدهم إليه. اخترنا لك غيره.` and reopens with the new suggestion; `khatma_full` → `اكتمل عدد المشاركين في هذه الختمة.`; success → toast `الجزء ${n} لك الآن. يسّر الله لك`.
  - Finish → toast `تقبّل الله منك 🤍` with "تراجع" and a 10-second bar; undo calls `undoFinish`.
  - Release → confirm sheet `لا بأس، جزاك الله خيراً` / `سنعيد الجزء ${n} ليقرأه غيرك. لن يعرف أحد أنك أعدته.` → toast `أعدناه إلى الختمة. جزاك الله خيراً`.
  - `CelebrationPage` (shown when `me.celebrateRound` is not null): gold ring, `ختمنا القرآن معاً`, `الحمد لله · ${name} · الختمة ${round}`, `شارك فيها ${participants} من أحبابك` (from `lastCompleted`), the duas 2:127 and 2:201 (Amiri Quran, exact Tanzil text, with `البقرة ١٢٧` / `البقرة ٢٠١`), "شارك الفرحة على واتساب" (`waShareLink`), and "تابع إلى الختمة" which calls `markCelebrated`.

- [ ] **Step 1: Write the failing tests:**

```tsx
test("taken result shows the race toast", async () => {});
test("finish shows the undo toast and undo calls undoFinish", async () => {});
test("release asks for confirmation first", async () => {});
test("celebration shows both duas with references and marks celebrated", async () => {
  /* expect text "رَبَّنَا تَقَبَّلْ مِنَّا" and "البقرة ١٢٧"; click "تابع إلى الختمة" → markCelebrated called */
});
```

- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Copy the two duas from Tanzil's Uthmani text into `ar.ts` with a source comment naming the Tanzil text version.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: take, finish, undo, release, and celebration screens`.

---

### Task 13: Home, create, invite, remind, and sign-out pages

**Files:**
- Create: `apps/web/src/pages/HomePage.tsx`, `CreatePage.tsx`, `SignOutPage.tsx`, `SettingsPage.tsx`
- Modify: `apps/web/src/lib/whatsapp.ts`, `apps/web/src/pages/KhatmaPage.tsx`
- Test: `apps/web/src/lib/whatsapp.messages.test.ts`, `apps/web/src/pages/CreatePage.test.tsx`, `apps/web/src/pages/SignOutPage.test.tsx`

**Interfaces:**
- Consumes: `api.khatmas.mine`, `create`, `ensureShareToken`; `api.sessions.signOutOthersByAlertToken`, `list`, `signOutOthers`, `signOutOne`, `me`; `api.people.updateDisplayName`.
- Produces:
  - `inviteMessage(khatmaName: string, url: string): string` → `السلام عليكم 🤍\nانضم إلينا في «${khatmaName}». نختم القرآن معاً، وكل واحد يأخذ جزءاً واحداً في كل مرة.\nاضغط هنا: ${url}`.
  - `remindMessage(khatmaName: string, openJuz: number[], targetEndAt: number | null, url: string): string` → lists open ajza' in Eastern Arabic digits joined by `، `, includes `حتى ${formatDate(targetEndAt)}` only when not null, and never includes a person's name.
  - `HomePage`: `السلام عليكم، ${displayName}`, cards per khatma (name, progress bar, `${done} من ٣٠ تمّت`, schedule, `جزؤك: ${n} · ${name}` when holding), "＋ ابدأ ختمة جديدة". Signed-out: short explanation plus "ابدأ ختمة جديدة".
  - `CreatePage`: optional name (placeholder `ختمة ${formatDate(now)}`), six schedule options with labels يومية / كل ٣ أيام / أسبوعية / كل أسبوعين / شهرية / بدون موعد (subtitles: يومية "نختم كل يوم", أسبوعية "الأكثر شيوعاً", بدون موعد "نقرأ على راحتنا"), "أنشئ الختمة". Signed-out → VerifySheet titled `قبل أن تنشئ ختمة`, then create. On success navigate to `/j/${inviteCode}` and open the invite sheet titled `تمّ إنشاء الختمة. ادعُ أحبابك`.
  - Invite sheet on KhatmaPage: preview of `inviteMessage` with the member's own link `${origin}/j/${inviteCode}?from=${shareToken}`, "أرسل على واتساب". Remind sheet: preview of `remindMessage`, `الرسالة لا تذكر أسماء أحد`.
  - `SignOutPage` reads `t` from the query string, calls `signOutOthersByAlertToken` with the local session token if there is one, and shows `سجّلنا خروج الأجهزة الأخرى. هذا الجهاز ما زال مسجّلاً.` when the local session survived, `سجّلنا خروجك من كل الأجهزة.` otherwise (and clears the local token), or `هذا الرابط لم يعد صالحاً.`.
  - `SettingsPage` at `/settings` (linked from HomePage as "إعداداتي"): edit display name; the masked number; signed-in devices with `deviceLabel` and last use, "هذا الجهاز" on the current one, "تسجيل خروج" per device, and "تسجيل الخروج من كل الأجهزة الأخرى".

- [ ] **Step 1: Write the failing tests:**

```ts
expect(remindMessage("ختمة العائلة", [14, 19], null, "https://x/j/a")).not.toMatch(/حتى/);
expect(remindMessage("ختمة العائلة", [14, 19], Date.UTC(2026, 9, 30), "https://x/j/a")).toContain("١٤، ١٩");
test("create with an empty name sends null", async () => {});
test("create offers exactly six schedules and no yearly", () => {});
test("sign-out page reports an invalid link", async () => {});
test("sign-out page keeps this device signed in when its session survived", async () => {});
test("settings lists devices and signs out others", async () => {});
```

- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat: home, create, invite, remind, and sign-out pages`.

---

### Task 14: Deploy and end-to-end smoke test

**Files:**
- Create: `apps/web/vercel.json` (SPA rewrite of all paths to `/index.html`), `e2e/core-loop.spec.ts`, `playwright.config.ts`, `docs/deploy.md`
- Modify: `.github/workflows/ci.yml` (deploy Convex on merge to `main` with `CONVEX_DEPLOY_KEY`)

**Interfaces:**
- Consumes: everything above.
- Produces: production Convex deployment (EU West), Vercel project `silsila-web`, and `docs/deploy.md` listing every environment variable by name (no values), where it's set, and how to rotate it.

- [ ] **Step 1: Write the smoke test** `e2e/core-loop.spec.ts` against the dev deployment, at a 390×844 viewport: person A verifies (simulated message through `npx convex run`), creates a weekly khatma, takes the suggested juz', and finishes it; person B in a second browser context opens A's invite link, sees `دعاك` + A's name, verifies, and takes a juz'. Assert B sees A's name only on a reading tile, never on a done tile.
- [ ] **Step 2:** Run `pnpm exec playwright test`. Expected: PASS against dev.
- [ ] **Step 3:** Create the production Convex deployment and the Vercel project; set `VITE_CONVEX_URL`, and the Convex env vars from Task 5 and `SILSILA_ENV=prod` (WhatsApp values come from ARQ-246; until then production returns `whatsapp_not_configured`, and the site shows `التحقق غير متاح الآن، حاول لاحقاً.`). Point the domain from ARQ-249 at Vercel.
- [ ] **Step 4:** With ARQ-246 done, register the webhook URL `https://<prod>.convex.site/whatsapp/webhook` in Meta, send a real verification from a real phone, and confirm the full flow.
- [ ] **Step 5: Commit** `chore: deploy pipeline and e2e smoke test`.

---

## Self-review notes

- **Spec coverage:** 3.2 create (Tasks 6, 13); 3.3 round timing and completion (Task 8; release rules → plan 2); 3.4 joining, viewer vs member, cap, share tokens (Tasks 6, 7, 13; link preview → plan 2); 3.5 take and rotation (Task 7); 3.6 finish, undo, release (Tasks 8, 12); 3.7 pool and names (Tasks 6, 10); 3.8 completion and celebration (Tasks 8, 12; push → plan 2); 4.x pace and nudges → plan 2; 5.1 language (Tasks 9-13); 5.2 verification and takeover protection (Tasks 5, 11, 13); 5.3 accessibility (Global Constraints, Tasks 9-10); 5.4 creator powers → plan 2; 5.5 admin → plan 3 (settings table and defaults exist from Task 3); 6 notifications → plan 2; 7 stack (Tasks 1, 9, 14); 8 data (Task 3); 9 privacy, retention, and rate limits including joining and taking (Tasks 3, 5, 7, Global Constraints); 5.2 signed-in devices list (Tasks 4, 13).
- **Known gap to watch:** per-IP rate limiting depends on whether Convex HTTP actions receive the client IP (Task 5, Step 3).
