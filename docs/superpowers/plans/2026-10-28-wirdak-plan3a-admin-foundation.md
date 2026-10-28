# Wirdak plan 3a: admin foundation and live settings, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `admin.wirdak.app` with allowlisted WhatsApp sign-in, separate 12-hour admin sessions, an audit log, admin management, and a validated live-settings editor. Make the website honor the announcement banner, maintenance mode, and the minimum client version.

**Architecture:** Admin auth reuses the WhatsApp verification pipeline. A verification marked `surface: "admin"` always ends at the code step, resolves to an `admins` row instead of `people`, and opens an `adminSessions` row. Because the change lives in `matchIncoming`, the production-to-staging relay carries admin codes unchanged. Every admin function goes through `adminQuery` / `adminMutation` wrappers, and every change writes an `auditLog` row in the same transaction. `apps/admin` is a second Vite + React app that imports the website's components and theme through an `@web` alias.

**Tech Stack:** Convex (with `convex-test` and `convex-helpers`), React 19, React Router 8, Vite 8, Tailwind 4, Vitest 5, Bun workspaces, Vercel, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-28-wirdak-plan3-design.md`. Read sections 2, 4, 9, 11 and 13 before starting.

### Where this sits

The plan 3 spec covers three subsystems that ship independently. Each gets its own plan, written once the one before it has landed, so it builds on real code:

- **3a (this plan):** the admin app, admin sign-in, allowlist, audit log, settings editor, and the website's banner, maintenance banner and version gate. Spec sections 4, 9 and 11.
- **3b:** help requests in the website, the help inbox, and admin push. Spec sections 3, 5 and 7 (help pushes), and the privacy policy update.
- **3c:** stats, the daily rollup, the morning summary, milestones, lookups and operations. Spec sections 6, 7 (summary and milestones) and 8.

## Global Constraints

- Arabic copy, right to left, in the website's look: colors and fonts from `apps/web/src/styles.css`.
- No AI attribution in commits or PRs (`CLAUDE.md`). Conventional Commits. Each commit ends with `Refs: ARQ-270`.
- Admin sessions end 12 hours after sign-in, however active the admin is.
- The 6-digit code step is always required for admins.
- A number that isn't on the allowlist gets the same generic failure as an expired code. Nothing reveals whether a number is an admin.
- An admin token never works for member functions, and a member token never works for admin functions.
- An admin sign-in never creates or touches a `people` row.
- Every admin mutation that changes something writes its audit row in the same transaction.
- A bad setting value is refused, not clamped.
- Raw tokens and PINs are never stored or logged. Only `sha256Hex` hashes go into tables, as with member sessions.
- The website's version is the **root** `package.json` `version`. `apps/web/package.json` stays at 0.0.0.
- `bun run typecheck`, `bun run lint`, and `bun run test` pass after every task.

## Review Focus

1. **A PIN from an admin verification typed into the member flow.** `verification.confirmPin` must answer `expired` for an `admin`-surface verification and never open a member session. Test: Task 3.
2. **An admin removed while signed in.** Their sessions end at removal, and a stale token is refused by the wrapper, not only by the UI. Test: Task 2.
3. **Turning maintenance off while maintenance is on.** Admin start skips the maintenance check, and member start keeps it. Test: Task 4.
4. **Pace settings saved in an impossible order** (minimum above default, or a quiet window with equal start and end). Refused with a clear code, and nothing written. Test: Task 5.
5. **A version gate loop on a stale cache.** The website reloads at most once per required version, then shows the manual button. Test: Task 7.

---

### Task 1: Admin tables, session wrappers, and the audit writer

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/lib/adminSession.ts`
- Create: `convex/lib/audit.ts`
- Test: `convex/lib/adminSession.test.ts`

**Interfaces:**
- Produces, in `convex/schema.ts`:
  - `admins`: `{ phone: string (E.164), addedBy: Id<"admins"> | null, addedAt: number }`, index `by_phone`.
  - `adminSessions`: `{ adminId, tokenHash, alertTokenHash, deviceLabel, createdAt, expiresAt }`, indexes `by_tokenHash`, `by_alertTokenHash`, `by_admin`, `by_expiresAt`.
  - `auditLog`: `{ adminId: Id<"admins"> | null, action: AuditAction, targetKind: "admin" | "setting", targetId: string, before: any, after: any, note: string | null, at: number }`, indexes `by_at` `["at"]`, `by_admin_at` `["adminId", "at"]`, `by_action_at` `["action", "at"]`.
  - `verifications` gains `surface: v.optional(v.literal("admin"))` (absent means the website) and `adminId: v.optional(v.id("admins"))`.
- Produces, in `convex/lib/adminSession.ts`:
  - `export const ADMIN_SESSION_TTL_MS = 12 * 3_600_000`
  - `resolveAdminSession(ctx, adminToken: string | undefined): Promise<{ admin: Doc<"admins">; session: Doc<"adminSessions"> } | null>`. Null when the token is missing, unknown, expired (`Date.now() >= expiresAt`), or its admin row is gone.
  - `adminQuery` / `adminMutation`: `customQuery` / `customMutation` taking `adminToken: v.string()`, throwing `ConvexError({ code: "not_admin" })` when `resolveAdminSession` is null, and putting `{ admin, session }` on `ctx`.
  - `deleteAdminSessions(ctx: MutationCtx, adminId: Id<"admins">): Promise<number>`, returning how many it deleted.
- Produces, in `convex/lib/audit.ts`:
  - `export type AuditAction = "admin.bootstrap" | "admin.add" | "admin.remove" | "setting.set" | "setting.reset"`. Plans 3b and 3c extend this union.
  - `writeAudit(ctx: MutationCtx, entry: { adminId: Id<"admins"> | null; action: AuditAction; targetKind: "admin" | "setting"; targetId: string; before: unknown; after: unknown; note?: string }): Promise<void>`, setting `at: Date.now()` and `note ?? null`.

- [ ] **Step 1: Write the failing tests** in `convex/lib/adminSession.test.ts`, following the `convexTest(schema, modules)` and fake-timer setup in `convex/sessions.test.ts`. Use a tiny test-only `adminQuery` exported from a fixture module, or `t.run` with `resolveAdminSession` directly:
  - `resolveAdminSession` returns the admin for a valid token.
  - It returns null for: no token, an unknown token, a token at exactly `createdAt + ADMIN_SESSION_TTL_MS`, and a token whose admin row was deleted.
  - A **member** session token (a `sessions` row with the same raw token hashed) resolves to null.
  - `deleteAdminSessions` deletes only that admin's rows and returns the count.
  - `writeAudit` inserts one row with `at === NOW` and `note === null` when no note is given.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/lib/adminSession.test.ts`
Expected: FAIL (module `./adminSession` not found).

- [ ] **Step 3: Add the tables and implement both modules.** Follow `convex/lib/session.ts` for the wrapper shape. The admin wrappers take `adminToken` as a **required** argument, so a member page can't call them by accident with an optional `sessionToken`.

- [ ] **Step 4: Run the tests and the full suite**

Run: `bun run test && bun run typecheck`
Expected: PASS. Existing verification tests still pass with the two new optional fields.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/lib/adminSession.ts convex/lib/audit.ts convex/lib/adminSession.test.ts
git commit -m "feat: add admin tables, admin session wrappers and the audit writer

Refs: ARQ-270"
```

### Task 2: The allowlist: bootstrap, add, remove, list

**Files:**
- Create: `convex/admins.ts`
- Test: `convex/admins.test.ts`

**Interfaces:**
- Consumes: `adminQuery`, `adminMutation`, `deleteAdminSessions`, `writeAudit` (Task 1). `WA_PHONE` from `convex/whatsapp.ts`.
- Produces:
  - `bootstrap` (`internalMutation`, args `{ phone: string }`) → `{ adminId }`. Throws `ConvexError({ code: "already_bootstrapped" })` when any admin exists. Audit: `admin.bootstrap`, `adminId: null`, `after: { phone }`.
  - `list` (`adminQuery`) → `Array<{ adminId, phone, addedAt, isMe: boolean }>`, oldest first.
  - `add` (`adminMutation`, args `{ phone: string, note?: string }`) → `{ adminId }`. Errors: `invalid_phone`, `already_admin`. Audit: `admin.add`.
  - `remove` (`adminMutation`, args `{ adminId: Id<"admins">, note?: string }`) → `null`. Error: `last_admin`. Ends that admin's sessions in the same transaction. Audit: `admin.remove`, `before: { phone }`.
  - `normalizeAdminPhone(raw: string): string | null`, exported: strips spaces, dashes and a leading `00`, turns Arabic digits into Latin with `normalizeDigits`, requires a leading `+`, and checks the digits against `WA_PHONE`. Returns `+<digits>` or null.

- [ ] **Step 1: Write the failing tests** in `convex/admins.test.ts`:
  - `bootstrap` creates the first admin and an audit row. A second `bootstrap` throws `already_bootstrapped`.
  - `normalizeAdminPhone("+971 50 123 4567")` is `"+971501234567"`. `"00971501234567"` gives the same. `"+٩٧١٥٠١٢٣٤٥٦٧"` gives the same. `"0501234567"` (no country code) is `null`.
  - `add` refuses an invalid phone and a duplicate, and writes `admin.add` with the caller's `adminId`.
  - `remove` refuses the last admin with `last_admin`.
  - `remove` on another admin deletes their `adminSessions`, so a later `list` with **their** token throws `not_admin`. This is Review Focus 2.
  - `list` called with a member session token throws `not_admin`.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/admins.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `convex/admins.ts`.**

- [ ] **Step 4: Run the tests**

Run: `bun run test convex/admins.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/admins.ts convex/admins.test.ts
git commit -m "feat: add the admin allowlist with bootstrap, add, remove and audit

Refs: ARQ-270"
```

### Task 3: Admin codes in the WhatsApp matching path

**Files:**
- Modify: `convex/verification.ts` (`createPending`, `matchIncoming`, `confirmPinInternal`)
- Modify: `convex/whatsapp.ts` (`takeIncoming`, message texts, `EnvName`)
- Test: `convex/verification.admin.test.ts`

**Interfaces:**
- Produces, in `convex/whatsapp.ts`:
  - `adminSiteUrl(): string`: `ADMIN_SITE_URL` without a trailing slash, falling back to `http://localhost:5174` in dev and `""` otherwise. Add `"ADMIN_SITE_URL"` to `EnvName`.
  - `adminPinReply(pin: string)`, text verbatim: `` `رمز الدخول إلى لوحة إدارة وِردك: ${pin}\nلا تعطه لأحد. إن لم تطلبه الآن فتجاهل هذه الرسالة.` ``
  - `adminSignInAlert(deviceLabel: string, alertToken: string)`, text verbatim: `` `تسجيل دخول إلى لوحة إدارة وِردك من ${deviceLabel}. إن لم تكن أنت، اضغط هنا لإنهاء كل جلسات الإدارة: ${adminSiteUrl()}/signout?t=${alertToken}` ``
- Changes:
  - `createPending` gains arg `surface: v.optional(v.literal("admin"))`. When it is `"admin"`, it **skips** the maintenance check and uses its own buckets: `adminStart:client:<hash>` 5 per 10 minutes, `adminStart:ip:<ip>` 10 per 10 minutes, and `adminStart:global` 20 per minute (sharded). These are constants, not settings. It stores `surface: "admin"` and `displayName: ""`.
  - `matchIncoming`'s `needs_pin` result becomes `{ kind: "needs_pin"; admin: boolean }`. For an admin-surface doc it **always** moves to `needs_pin` with `phone` and `pinHash`. It sets `adminId` when an `admins` row has that phone, and leaves it unset otherwise. The reply is the same either way, so nothing reveals admin status. It never reads or writes `people`. Write a helper `toAdminNeedsPin(ctx, doc, { phone, pinHash, adminId })` beside `toNeedsPin`, rather than loosening `toNeedsPin`'s type.
  - `takeIncoming` sends `adminPinReply(pin)` when `result.admin` is true, else `pinReply(pin)`. The relay route calls `takeIncoming`, so staging handles relayed admin codes with no change to `http.ts`.
  - `confirmPinInternal` (member) returns `{ kind: "expired" }` for any doc with `surface === "admin"`, before checking the PIN.

- [ ] **Step 1: Write the failing tests** in `convex/verification.admin.test.ts`. Insert a pending admin verification with `t.run`, or through `createPending` with `surface: "admin"`:
  - `matchIncoming` from an allowlisted phone gives `{ kind: "needs_pin", admin: true }`, sets `adminId`, and creates no `people` row.
  - From a phone that isn't on the allowlist: same result, `adminId` unset, no `people` row.
  - From a phone that **has** a member account but isn't an admin: same result, and the `people` row is unchanged.
  - Calling member `confirmPinInternal` with the right PIN hash on an admin doc gives `expired` and creates no `sessions` row. This is Review Focus 1.
  - `takeIncoming` with a fake `send` sends a text starting `رمز الدخول إلى لوحة إدارة وِردك` for an admin doc, and `رمز الدخول إلى وِردك` for a member doc.
  - `createPending` with `surface: "admin"` succeeds while `maintenanceMode` is `true`. Without `surface`, it still returns `{ error: "maintenance" }`. This is Review Focus 3, backend half.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/verification.admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the changes listed above.**

- [ ] **Step 4: Run the new tests and the existing verification and WhatsApp suites**

Run: `bun run test convex/verification convex/whatsapp && bun run typecheck`
Expected: PASS. Update existing `takeIncoming` and `matchIncoming` assertions that expect the old `needs_pin` shape to include `admin: false`.

- [ ] **Step 5: Commit**

```bash
git add convex/verification.ts convex/whatsapp.ts convex/verification.admin.test.ts convex/verification.test.ts convex/whatsapp.test.ts
git commit -m "feat: send admin sign-in codes through the WhatsApp matching path

Refs: ARQ-270"
```

### Task 4: Admin sign-in: start, confirm, sign out

**Files:**
- Create: `convex/adminAuth.ts`
- Modify: `convex/verification.ts` (`startInternal` passes `surface` through)
- Modify: `convex/http.ts` (new route)
- Test: `convex/adminAuth.test.ts`, `convex/http.admin.test.ts`

**Interfaces:**
- Consumes: Task 1 tables and helpers, Task 3 `adminSignInAlert`, `adminSiteUrl`, and the admin `needs_pin` state.
- Produces:
  - HTTP `POST /api/admin/verification/start`, body `{ clientKey: string }`, response `{ verificationId, secret, code, waNumber, message }`, or `{ error }` with the same status map as `/api/verification/start`. `OPTIONS` mirrors the member route. The allowed origin is `adminSiteUrl()` (plus `http://localhost:5174` in dev). Write `allowedAdminOrigin(origin)` beside `allowedOrigin` rather than widening the member check.
  - `startInternal` gains `surface: v.optional(v.literal("admin"))`. For admin it skips `cleanDisplayName` and passes `surface` to `createPending`.
  - `adminAuth.confirmPin` (`action`, args `{ verificationId, secret, pin, deviceLabel }`) → `{ adminToken: string } | { error: "wrong_pin" | "too_many_attempts" | "expired" }`. It normalizes the PIN like the member `confirmPin`. On success it sends `adminSignInAlert` to the phone.
  - `adminAuth.confirmPinInternal` (`internalMutation`): refuses docs without `surface === "admin"` (`expired`), checks attempts and the PIN like the member version, then answers `expired` if `adminId` is unset or its `admins` row is gone. Otherwise it inserts `adminSessions` with `expiresAt = now + ADMIN_SESSION_TTL_MS` and marks the doc `claimed`. The PIN is checked **before** admin existence, so a non-admin sees `wrong_pin` or `expired` exactly as an admin would with a stale code.
  - `adminAuth.me` (`query`, args `{ adminToken: v.optional(v.string()) }`) → `{ adminId, phone, expiresAt } | null`.
  - `adminAuth.signOut` (`adminMutation`) → `null`. Deletes only the caller's session.
  - `adminAuth.signOutByAlertToken` (`mutation`, args `{ alertToken }`) → `{ ok: boolean }`. Deletes **every** session of the admin whose session carries that alert token hash.

- [ ] **Step 1: Write the failing tests.**
  - In `adminAuth.test.ts`:
    - The full path signs in: an admin doc at `needs_pin`, then `confirmPin` with the right PIN (stub `sendWhatsAppText` as the member tests do), then `me` returns the phone and `expiresAt === NOW + 12h`.
    - Wrong PIN gives `wrong_pin`. After `pinMaxAttempts`, `too_many_attempts`.
    - A non-admin doc with the right PIN gives `expired` and no `adminSessions` row.
    - A **member** verification (no `surface`) passed to admin `confirmPin` gives `expired`.
    - Advancing time by 12h makes `me` null, and `admins.list` throws `not_admin`.
    - `signOutByAlertToken` ends all of that admin's sessions and no other admin's.
  - In `http.admin.test.ts`, using `t.fetch`:
    - The admin route answers 403 for `Origin: https://wirdak.app` and 200 for the admin origin (set `ADMIN_SITE_URL` with `vi.stubEnv`).
    - The member route still answers 403 for the admin origin.
    - The admin route succeeds while `maintenanceMode` is on. This is Review Focus 3, HTTP half.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/adminAuth.test.ts convex/http.admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `convex/adminAuth.ts`, the `startInternal` change, and the route.**

- [ ] **Step 4: Run the tests**

Run: `bun run test convex && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/adminAuth.ts convex/verification.ts convex/http.ts convex/adminAuth.test.ts convex/http.admin.test.ts
git commit -m "feat: add admin sign-in with 12-hour sessions and a sign-in alert

Refs: ARQ-270"
```

### Task 5: Setting specs, validated writes, and the public settings query

**Files:**
- Create: `convex/lib/settingSpecs.ts`
- Modify: `convex/lib/settings.ts` (two new keys)
- Create: `convex/adminSettings.ts`
- Create: `convex/publicSettings.ts`
- Test: `convex/lib/settingSpecs.test.ts`, `convex/adminSettings.test.ts`; update `convex/lib/settings.test.ts` ("defaults match the spec")

**Interfaces:**
- Changes `SETTING_DEFAULTS`: add `maintenanceMessage: null as string | null` and `minClientVersion: null as string | null`.
- Produces, in `convex/lib/settingSpecs.ts`:
  - `type SettingGroup = "pace" | "notifications" | "limits" | "sessions" | "switches"`
  - `type SettingSpec = { group: SettingGroup } & ({ kind: "int"; min: number; max: number } | { kind: "number"; min: number; max: number } | { kind: "duration"; min: number; max: number } | { kind: "hour" } | { kind: "bool" } | { kind: "text"; maxLength: number } | { kind: "version" } | { kind: "grace" })`. `text` and `version` also accept `null`.
  - `SETTING_SPECS: { [K in SettingKey]: SettingSpec }`. The mapped type makes a missing key a type error.
  - `validateSetting(key: SettingKey, value: unknown): string | null`, returning an error code (`wrong_type`, `out_of_range`, `too_long`, `bad_version`, `bad_grace`) or null.
  - `crossCheck(next: { defaultPaceMs; paceMinMs; paceMaxMs; quietStartHour; quietEndHour }): string | null`, returning `pace_order` unless `paceMinMs <= defaultPaceMs <= paceMaxMs`, and `quiet_hours_equal` when start equals end.
- Produces, in `convex/adminSettings.ts`:
  - `list` (`adminQuery`) → `Array<{ key, value, defaultValue, isDefault, spec }>` in `SETTING_DEFAULTS` order.
  - `set` (`adminMutation`, args `{ key: v.string(), value: v.any(), note?: v.string() }`) → `{ ok: true } | { error: string }`. Refuses unknown keys (`unknown_key`), runs `validateSetting`, then `crossCheck` with the other values read through `getSetting`. On success it upserts the row and writes `setting.set` with `before` and `after`. On any error it writes nothing.
  - `reset` (`adminMutation`, args `{ key }`) → `{ ok: true } | { error: string }`. Deletes the row, cross-checks against the default, and writes `setting.reset`.
- Produces, in `convex/publicSettings.ts`:
  - `get` (`query`, no args) → `{ announcement: string | null; maintenanceMode: boolean; maintenanceMessage: string | null; minClientVersion: string | null }`. Nothing else is public.

Bounds for `SETTING_SPECS`. `duration` values are in ms, written below in their natural unit. `hour` is a whole number from 0 to 23.

| Key | Kind | Min | Max | Group |
|---|---|---|---|---|
| `maxMembers` | int | 2 | 500 | limits |
| `rotationLookbackRounds` | int | 0 | 10 | pace |
| `undoWindowMs` | duration | 3 s | 60 s | pace |
| `completionDelayMs` | duration | 0 | 60 s | pace |
| `verificationTtlMs` | duration | 2 min | 30 min | sessions |
| `pinMaxAttempts` | int | 3 | 10 | sessions |
| `verifyStartPerClientPer10Min` | int | 1 | 100 | limits |
| `verifyStartPerIpPer10Min` | int | 1 | 1000 | limits |
| `verifyPerPhonePerHour` | int | 1 | 100 | limits |
| `verifyGlobalPerMinute` | int | 10 | 10000 | limits |
| `poolActionsPerPersonPerMinute` | int | 1 | 100 | limits |
| `createsPerPersonPerDay` | int | 1 | 100 | limits |
| `newMembersPerKhatmaPerHour` | int | 1 | 500 | limits |
| `nameChangesPerPersonPerHour` | int | 1 | 100 | limits |
| `graceDefaults` | grace (every schedule key present, each `isValidGrace`) | | | pace |
| `graceNoticeFraction` | number | 0.05 | 0.75 | pace |
| `quietStartHour`, `quietEndHour` | hour | | | notifications |
| `defaultPaceMs` | duration | 1 day | 14 days | pace |
| `paceMinMs` | duration | 1 hour | 7 days | pace |
| `paceMaxMs` | duration | 1 day | 30 days | pace |
| `paceMinCountedMs` | duration | 0 | 2 hours | pace |
| `paceSampleSize` | int | 1 | 20 | pace |
| `paceMinFinishes` | int | 1 | 20 | pace |
| `reminderPaceMultiple` | number | 1.1 | 5 | notifications |
| `nudgeCooldownMs` | duration | 1 hour | 7 days | notifications |
| `openForHelpBatchMs` | duration | 0 | 6 hours | notifications |
| `organizerInactiveMs` | duration | 7 days | 180 days | sessions |
| `successorActiveMs` | duration | 1 day | 30 days | sessions |
| `notesRetentionMs` | duration | 1 day | 365 days | sessions |
| `notesUnclearedCapMs` | duration | 30 days | 730 days | sessions |
| `handoffTtlMs` | duration | 5 min | 2 hours | sessions |
| `previewPerIpPerMinute` | int | 1 | 1000 | limits |
| `handoffRedeemGlobalPerMinute` | int | 1 | 1000 | limits |
| `maintenanceMode` | bool | | | switches |
| `announcement`, `maintenanceMessage` | text, `maxLength` 200 | | | switches |
| `minClientVersion` | version (`/^\d+\.\d+\.\d+$/`) | | | switches |

`int` and `hour` also require `Number.isInteger`. `text` is trimmed, and an empty string is stored as `null`.

- [ ] **Step 1: Write the failing tests.**
  - In `settingSpecs.test.ts`:
    - `validateSetting("maxMembers", 1)` is `out_of_range`, `2` is null, `2.5` is `wrong_type`, and `"60"` is `wrong_type`.
    - `validateSetting("announcement", "x".repeat(201))` is `too_long`, and `null` is null.
    - `validateSetting("minClientVersion", "1.2")` is `bad_version`.
    - `validateSetting("graceDefaults", { ...DEFAULT_GRACE, daily: { value: 10, unit: "minutes" } })` is `bad_grace`.
    - `crossCheck` with `paceMinMs` above `defaultPaceMs` is `pace_order`, and with `quietStartHour === quietEndHour` is `quiet_hours_equal`.
    - Every `SETTING_DEFAULTS` value passes its own spec.
  - In `adminSettings.test.ts`:
    - `set("maxMembers", 40)` changes `getSetting` and writes `setting.set` with `before: 60, after: 40`.
    - `set("paceMinMs", 10 * DAY)` returns `{ error: "pace_order" }`, and neither a settings row nor an audit row exists. This is Review Focus 4.
    - `set("nope", 1)` returns `unknown_key`.
    - `reset` deletes the row and writes `setting.reset`.
    - `list` with a member token throws `not_admin`.
    - `publicSettings.get` returns exactly the four public keys.
  - In `settings.test.ts`, add the two new keys to "defaults match the spec".

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/lib/settingSpecs.test.ts convex/adminSettings.test.ts convex/lib/settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the modules.**

- [ ] **Step 4: Run the tests**

Run: `bun run test convex && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/settingSpecs.ts convex/lib/settings.ts convex/adminSettings.ts convex/publicSettings.ts convex/lib/settingSpecs.test.ts convex/adminSettings.test.ts convex/lib/settings.test.ts
git commit -m "feat: validate and edit live settings, and expose the public ones

Refs: ARQ-270"
```

### Task 6: Reading the audit log, and its retention

**Files:**
- Create: `convex/audit.ts`
- Modify: `convex/maintenance.ts` (`purge`)
- Test: `convex/audit.test.ts`; extend `convex/maintenance.test.ts`

**Interfaces:**
- Consumes: `auditLog` and its indexes (Task 1).
- Produces:
  - `audit.list` (`adminQuery`, args `{ paginationOpts: paginationOptsValidator, adminId?: Id<"admins">, action?: AuditAction }`) → a Convex pagination result of `{ _id, at, action, targetKind, targetId, before, after, note, adminPhone: string | null }`, newest first. With `adminId`, it uses `by_admin_at`. With `action`, it uses `by_action_at`. Passing both is refused with `ConvexError({ code: "one_filter" })`.
  - `purge` also deletes `auditLog` rows older than `AUDIT_TTL_MS = 2 * 365 * DAY_MS`, and `adminSessions` rows whose `expiresAt` has passed, in the same batched style as its other tables. `adminSessions` gains an index `by_expiresAt` for this; add it in Task 1's schema change.

- [ ] **Step 1: Write the failing tests.**
  - `list` returns rows newest first and filters by admin and by action.
  - `adminPhone` is null for `admin.bootstrap` rows.
  - `purge` deletes an audit row at `NOW - AUDIT_TTL_MS - 1` and keeps one at `NOW - AUDIT_TTL_MS + 1`.
  - `purge` deletes an `adminSessions` row with `expiresAt` of `NOW - 1` and keeps one with `expiresAt` of `NOW + 1`.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test convex/audit.test.ts convex/maintenance.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the tests**

Run: `bun run test convex && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/audit.ts convex/maintenance.ts convex/audit.test.ts convex/maintenance.test.ts
git commit -m "feat: list the audit log and purge rows after two years

Refs: ARQ-270"
```

### Task 7: The website: announcement banner, maintenance banner, version gate

**Files:**
- Modify: `apps/web/vite.config.ts` (define `__APP_VERSION__`)
- Modify: `apps/web/src/vite-env.d.ts` (`declare const __APP_VERSION__: string`)
- Modify: `vitest.config.ts` (the same `define` for the `web` project)
- Create: `apps/web/src/features/status/StatusBanners.tsx`
- Create: `apps/web/src/features/status/versionGate.ts`
- Modify: `apps/web/src/App.tsx` (mount `<StatusBanners />` above `<Routes>`)
- Modify: `apps/web/src/i18n/ar.ts` (`t.status`)
- Test: `apps/web/src/features/status/StatusBanners.test.tsx`, `apps/web/src/features/status/versionGate.test.ts`

**Interfaces:**
- Consumes: `api.publicSettings.get` (Task 5).
- Produces:
  - `__APP_VERSION__`: in `vite.config.ts`, read with `JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")).version`. That's the **root** file.
  - `isOlder(a: string, b: string): boolean`, a numeric `x.y.z` compare.
  - `versionGate(current: string, required: string | null, storage: { get(k): string | null; set(k, v): void }): "ok" | "reload" | "stuck"`. It returns `ok` when `required` is null or not newer. It returns `reload` the first time for a given `required`, recording `wirdak.reloadedFor = required`. It returns `stuck` when `wirdak.reloadedFor` already equals `required`.
  - `StatusBanners`, which renders in order:
    1. The maintenance banner while `maintenanceMode` is on: `maintenanceMessage ?? t.status.maintenanceDefault`, role `status`, with no close button.
    2. The announcement while `announcement` is non-null and its text isn't the one stored in `wirdak.announcementDismissed`. It has a close button that stores the text.
    3. On `stuck`, a bar with `t.status.updateNeeded` and a button that calls `location.reload()`.
    On `reload` it calls `location.reload()` once, from an effect.
- Copy, verbatim:
  - `t.status.maintenanceDefault`: `"نعمل على تحسين وِردك. نعود قريبًا بإذن الله."`
  - `t.status.updateNeeded`: `"يوجد إصدار أحدث من وِردك."`
  - `t.status.updateButton`: `"حدّث الصفحة"`
  - `t.status.dismiss`: `"إخفاء"`

- [ ] **Step 1: Write the failing tests.**
  - In `versionGate.test.ts`:
    - `isOlder("0.2.1", "0.10.0")` is true. `isOlder("1.0.0", "1.0.0")` is false.
    - `versionGate("0.2.1", null, s)` is `ok`.
    - `versionGate("0.2.1", "0.3.0", s)` is `reload`, then a second call is `stuck`. This is Review Focus 5.
    - A newer required version after `stuck` gives `reload` again.
  - In `StatusBanners.test.tsx`, mocking `convex/react`'s `useQuery` as the existing page tests do:
    - Maintenance shows the default copy, or the custom message, with no close button.
    - The announcement hides after "إخفاء", stays hidden for the same text, and shows again for new text.
    - Nothing renders when the query is `undefined` (loading).

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test apps/web/src/features/status`
Expected: FAIL.

- [ ] **Step 3: Implement.** Use `readStored` and `writeStored` from `apps/web/src/lib/session.ts` for storage, so a blocked `localStorage` still works.

- [ ] **Step 4: Run the web suite and build**

Run: `bun run test apps/web && bun --cwd apps/web run build`
Expected: PASS, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web vitest.config.ts
git commit -m "feat: show the announcement and maintenance banners and reload old versions

Refs: ARQ-270"
```

### Task 8: The admin app shell

**Files:**
- Create: `apps/admin/package.json`, `apps/admin/index.html`, `apps/admin/vite.config.ts`, `apps/admin/tsconfig.json`, `apps/admin/vercel.json`
- Create: `apps/admin/src/main.tsx`, `apps/admin/src/App.tsx`, `apps/admin/src/styles.css`, `apps/admin/src/vite-env.d.ts`
- Create: `apps/admin/src/lib/adminSession.ts`
- Create: `apps/admin/src/components/Layout.tsx`
- Create: `apps/admin/src/i18n/ar.ts`
- Create: `apps/admin/src/test/setup.ts`
- Modify: `vitest.config.ts` (an `admin` project), root `package.json` (`dev:admin`, and `typecheck` adds `tsc --noEmit -p apps/admin`)
- Test: `apps/admin/src/App.test.tsx`

**Interfaces:**
- Produces:
  - Aliases, in both `vite.config.ts` and `tsconfig.json` `paths`: `@convex/*` → `../../convex/*`, and `@web/*` → `../web/src/*`.
  - `apps/admin/src/styles.css`: `@import "../../web/src/styles.css";` then `@source "../../web/src/components";`.
  - The dev server runs on port **5174** (`server.port`), matching the `adminSiteUrl()` dev fallback.
  - `apps/admin/src/lib/adminSession.ts`: `getAdminToken()`, `setAdminToken(t)`, `clearAdminToken()`, and `useAdminToken(): string | null`, with storage key `wirdak.admin.session`, in the same style as `apps/web/src/lib/session.ts`.
  - `Layout`: the header (logo plus a "الإدارة" tag) and a bottom nav with الرئيسية `/`, الإعدادات `/settings`, السجل `/audit`, and المشرفون `/admins`. Plans 3b and 3c add المساعدة and بحث.
  - `App`: with no valid admin (`adminAuth.me` returns null), every route renders the sign-in page (Task 9). Otherwise routes render inside `Layout`. `/signout` always renders the alert sign-out page.
  - `apps/admin/vercel.json`: `"installCommand": ""`, `"buildCommand": "bun run build"` (it runs inside the Root Directory `apps/admin`, and `bun install` already ran at the root in the workflow), `"outputDirectory": "dist"`, `"git": { "deploymentEnabled": false }`, an SPA rewrite to `/index.html`, the same security headers as `apps/web/vercel.json` except `Permissions-Policy`, which stays `camera=(), microphone=(), geolocation=()`, and `X-Robots-Tag: noindex, nofollow` on every path.
  - `index.html`: `lang="ar" dir="rtl"`, title `وِردك · الإدارة`, `<meta name="robots" content="noindex, nofollow">`, and the same Google Fonts link as the website.

- [ ] **Step 1: Write the failing test** `App.test.tsx`:
  - With `adminAuth.me` mocked to null, `/settings` shows the sign-in heading.
  - With it mocked to an admin, `/` shows the four nav links.

- [ ] **Step 2: Run it and see it fail**

Run: `bun run test apps/admin`
Expected: FAIL.

- [ ] **Step 3: Scaffold the app and implement the shell.** Then run `bun install` so the workspace links.

- [ ] **Step 4: Verify**

Run: `bun run test apps/admin && bun run typecheck && bun run lint && bun --cwd apps/admin run build`
Expected: PASS, and `apps/admin/dist/index.html` exists.

- [ ] **Step 5: Commit**

```bash
git add apps/admin vitest.config.ts package.json bun.lock
git commit -m "feat: scaffold the admin app with the website's look

Refs: ARQ-270"
```

### Task 9: Admin sign-in and sign-out pages

**Files:**
- Create: `apps/admin/src/pages/SignInPage.tsx`
- Create: `apps/admin/src/pages/AlertSignOutPage.tsx`
- Modify: `apps/admin/src/App.tsx`, `apps/admin/src/i18n/ar.ts`
- Test: `apps/admin/src/pages/SignInPage.test.tsx`, `apps/admin/src/pages/AlertSignOutPage.test.tsx`

**Interfaces:**
- Consumes: `POST {convexSiteUrl}/api/admin/verification/start`, `api.verification.status`, `api.adminAuth.confirmPin`, `api.adminAuth.signOutByAlertToken`, and `api.adminAuth.signOut` (Task 4). `convexSiteUrl()` comes from `@web/lib/env`, and `waLink` and `deviceLabel` from `@web/lib/whatsapp` and `@web/lib/format`. The client key is a random value kept in `wirdak.admin.client`.
- Behavior:
  - Step 1 is a single button, "الدخول عبر واتساب". It opens WhatsApp with the ready-made message, the same blank-window trick as `useVerification.ts`, and shows "بانتظار رسالتك…" while it watches `verification.status`.
  - At `needs_pin` it shows a 6-digit field. Submitting calls `confirmPin`. On `{ adminToken }` it stores the token, and the shell renders.
  - On `expired` or `wrong_pin` it shows that error. On `too_many_attempts` it shows that error and offers to start over.
  - `AlertSignOutPage` reads `?t=`, calls `signOutByAlertToken` once, and shows "انتهت كل جلسات الإدارة." on `ok`, or "الرابط غير صالح أو مستخدم." otherwise. It also clears the local admin token.
  - A sign-out button in `Layout` calls `adminAuth.signOut`, then clears the token.
  - Any `ConvexError` with `code: "not_admin"` from a page query clears the token, so the sign-in page shows. Handle this once in `App`, with a small error boundary or a `useQuery` wrapper, not on every page.

- [ ] **Step 1: Write the failing tests:**
  - Start, then a status mock of `needs_pin`, then typing `١٢٣٤٥٦` calls `confirmPin` with that PIN and stores the returned token.
  - `wrong_pin` shows the error text.
  - The alert page calls `signOutByAlertToken` exactly once and shows the ok copy.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test apps/admin/src/pages`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the tests**

Run: `bun run test apps/admin && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat: add admin sign-in with the WhatsApp code, and alert sign-out

Refs: ARQ-270"
```

### Task 10: Admin pages: home switches, settings editor, admins, audit log

**Files:**
- Create: `apps/admin/src/pages/HomePage.tsx`, `SettingsPage.tsx`, `AdminsPage.tsx`, `AuditPage.tsx`
- Create: `apps/admin/src/components/SettingField.tsx`
- Create: `apps/admin/src/lib/formatSetting.ts`
- Modify: `apps/admin/src/App.tsx`, `apps/admin/src/i18n/ar.ts`
- Test: `apps/admin/src/lib/formatSetting.test.ts`, `apps/admin/src/components/SettingField.test.tsx`, `apps/admin/src/pages/AdminsPage.test.tsx`

**Interfaces:**
- Consumes: `adminSettings.list`, `set`, `reset`; `admins.list`, `add`, `remove`; `audit.list`; `SETTING_SPECS` types.
- Produces:
  - `formatSetting(spec: SettingSpec, value: unknown): string` gives readable Arabic: `duration` in the largest whole unit (`"٣ أيام"`, `"١٠ دقائق"`, `"٤٥ ثانية"`), `hour` as `"22:00"`, `bool` as `"مفعّل"` / `"متوقف"`, a null text as `"—"`, and numbers with Arabic digits.
  - `SettingField`: one row per setting with the label, the current value, the default, and the range, plus an edit sheet. `duration` is a number with a unit select (seconds, minutes, hours, days). `grace` reuses `GraceField` from `@web/components/GraceField` per schedule. Others get a plain input or a switch (`SwitchRow`). The server's error code shows under the field. "إرجاع للافتراضي" calls `reset`.
  - `HomePage` (until plan 3c adds stats): the maintenance switch and its message, and the announcement text with a save button, all through `adminSettings.set`.
  - `SettingsPage`: every setting, grouped by `spec.group`, using `SettingField`.
  - `AdminsPage`: the list (marking "أنت"), an add form (phone), and remove with a confirm sheet. The server's `last_admin`, `already_admin` and `invalid_phone` show as copy.
  - `AuditPage`: newest first, with "load more" (pagination) and a filter by action. Each row shows when, who (`adminPhone` or "النظام"), what, and the before and after values formatted with `formatSetting` when `targetKind === "setting"`.
- Labels: one Arabic label per setting key, in `apps/admin/src/i18n/ar.ts` as `t.settings.labels: Record<SettingKey, string>`, so a missing label is a type error.

- [ ] **Step 1: Write the failing tests:**
  - `formatSetting({kind:"duration",...}, 3 * DAY)` is `"٣ أيام"`, and `259200000` never appears.
  - `SettingField` for `maxMembers` submits `40` as a number, not `"40"`, and shows `out_of_range` copy when the mocked `set` returns it.
  - `AdminsPage` shows the `last_admin` copy when `remove` returns that error.

- [ ] **Step 2: Run them and see them fail**

Run: `bun run test apps/admin`
Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the whole suite**

Run: `bun run test && bun run typecheck && bun run lint && bun --cwd apps/admin run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat: add the admin settings editor, admins list, and audit log pages

Refs: ARQ-270"
```

### Task 11: Deploying the admin app, and the docs

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/deploy.md`
- Modify: `apps/web/vercel.json` (nothing in 3a; voice notes change `Permissions-Policy` in 3b. Listed so the reviewer checks it stays untouched.)

**Interfaces:**
- `deploy.yml`: after the website's `Deploy` step, three more steps run with `VERCEL_PROJECT_ID: ${{ vars.VERCEL_ADMIN_PROJECT_ID }}` set on each step:
  1. `vercel pull --yes --environment="$TARGET"`
  2. `vercel build --target="$TARGET"`, with no `CONVEX_DEPLOY_KEY`, because the website step already pushed the functions
  3. `vercel deploy --prebuilt --target="$TARGET"`, appending `Deployed admin …` to the step summary
  Run them from the repository root, like the website's steps. Vercel applies the project's Root Directory (`apps/admin`) relative to where the CLI runs. Before the admin `vercel pull`, run `rm -rf .vercel`, so the website's project settings and build output don't leak into the admin build.
- `docs/deploy.md`: a new "Admin app" section covering the domains (`admin.wirdak.app`, `stg-admin.wirdak.app`), the `wirdak-admin` Vercel project (root `apps/admin`, Git deploys off, Vercel Authentication off), the `VITE_CONVEX_URL` Vercel env var per environment, the `VERCEL_ADMIN_PROJECT_ID` repo variable, the `ADMIN_SITE_URL` Convex env var per deployment, and the bootstrap command:

```sh
bun run convex run admins:bootstrap '{"phone": "+9715XXXXXXXX"}' --deployment manzilo:wirdak:<staging|production>
```

  It also adds `ADMIN_SITE_URL` to the Convex env table.

- [ ] **Step 1: Make the changes.** There's no unit test here.

- [ ] **Step 2: Check the workflow.** Once Ali's setup task (step 3) is done, run the Deploy workflow by hand for `environment: staging` with this branch as `ref`. `docs/deploy.md` allows that for staging. Expected: the website and admin steps both succeed, and `stg-admin.wirdak.app` serves the sign-in page. Until the setup is done, say in the PR that this check is pending.

- [ ] **Step 3: Create Ali's Linear task.** Create it in project Wirdak, team ARQ, assigned to `me`, and `blocks` ARQ-270. Title: "[You] Set up the admin app on Vercel and Convex". Steps: create the `wirdak-admin` Vercel project with root `apps/admin`, Git deploys off, and Vercel Authentication off. Add the domains `admin.wirdak.app` (production) and `stg-admin.wirdak.app` (staging environment). Set `VITE_CONVEX_URL` for each environment. Set the repo variable `VERCEL_ADMIN_PROJECT_ID`. Set `ADMIN_SITE_URL` on both Convex deployments. After the first deploy, run the bootstrap on staging, then production.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml docs/deploy.md
git commit -m "chore: deploy the admin app after the website and document its setup

Refs: ARQ-270"
```

### Task 12: End-to-end check on staging

- [ ] **Step 1:** Once Ali's setup task is done and the branch is merged and on staging: open `stg-admin.wirdak.app`, sign in with the bootstrapped number, and confirm that the WhatsApp code message, the sign-in alert, and the alert's sign-out link all work.
- [ ] **Step 2:** Turn on maintenance from the home page, and confirm the banner appears on `stg.wirdak.app` within seconds while pages stay readable. Turn it off.
- [ ] **Step 3:** Post an announcement, dismiss it on the website, change the text, and confirm it shows again.
- [ ] **Step 4:** Set `minClientVersion` above the staging version. Confirm one reload, then the "حدّث الصفحة" bar, and no loop. Reset it.
- [ ] **Step 5:** Confirm each change above is in the audit log with the right before and after values.
