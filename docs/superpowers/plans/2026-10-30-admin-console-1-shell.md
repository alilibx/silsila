# Admin Console Plan 1: Shell and Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `apps/admin` onto shadcn with its own theme, a sidebar on desktop, and a phone layout, with no change in behavior.

**Architecture:** Add shadcn components beside the existing code, with the old theme tokens aliased to the new ones so unconverted screens keep working. Replace `Layout.tsx`, then restyle the pages one group at a time. Page logic, Convex calls, Arabic text, and accessible names stay the same, so the existing tests are the regression proof.

**Tech Stack:** React 19, react-router 8, Convex, Tailwind 4, shadcn/ui on `radix-ui`, `lucide-react`, Vitest, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-10-30-wirdak-admin-console-design.md` (sections 5 and 8, build step 1). Linear: ARQ-294.

**This is plan 1 of 6.** The design has independent subsystems, so each gets its own plan, written once the code before it exists:

| Plan | Build steps | Linear |
| --- | --- | --- |
| 1. Shell and restyle (this plan) | 1 | ARQ-294 |
| 2. Rotating khatma panels in console components, then lists and roles | 2, 3 | ARQ-294, ARQ-295, ARQ-297 |
| 3. CRUD, account deletion, moving a number | 4 | ARQ-295, ARQ-306 |
| 4. Support view, reading, and the WhatsApp log | 5, 6 | ARQ-296 |
| 5. Global search | 7 | ARQ-303 |
| 6. Tool layer, agent chat, and MCP | 8 to 11 | ARQ-301, ARQ-302, ARQ-304, ARQ-305 |

**Rotating khatma pages are out of scope here.** `RotaHelpPage`, `RotaCreatePage`, and `RotaSetupPage` keep their `@web` components and render through the aliased tokens. Plan 2 rebuilds them.

## Global Constraints

- No behavior changes: same routes, same Convex calls, same Arabic strings from `t` in `apps/admin/src/i18n/ar.ts`.
- Keep every accessible name, heading level, and role that tests use. Change an existing test only for structure, never to weaken what it asserts.
- Arabic and right-to-left. Use logical classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), not `ml-`, `mr-`, `left-`, or `right-`.
- Phone numbers use `dir="ltr"`, as they do now.
- shadcn's `side="left"` means the start edge in these right-to-left components, which is the right side of the screen.
- No sideways scroll at 375px. In a grid that holds tables, tabs, or truncated text, use `grid-cols-1`, because a bare `grid` lets children stretch the page.
- Commit messages use Conventional Commits, reference `ARQ-294`, and carry no AI attribution (`CLAUDE.md`).
- Don't push or open a pull request until Task 9 passes.

## Review Focus

- **A very long Arabic name or khatma name on a phone** should wrap or truncate inside its row, not push the page sideways. Test in Task 9.
- **Blocked browser storage** (private mode) should still render the panel, using the system theme. Test in Task 2.
- **A page reached through "المزيد" on a phone** should still show the "المزيد" tab as active, so the admin knows where they are. Test in Task 3.
- **Pressing Enter in the confirm dialog's note field** should add a new line, not confirm a block or a sign-out. Test in Task 4.
- **100 or more open help requests** should show `t.help.manyOpen` in the sidebar, the collapsed sidebar, and the phone bar, not a clipped number. Test in Task 3.

---

### Task 1: Track the prototype without linting it

The design copies components from `prototypes/admin-console`, which is untracked and exists only in this worktree.

**Files:**
- Modify: `eslint.config.js` (ignores)
- Modify: `.prettierignore`
- Add: `prototypes/admin-console/` (`node_modules` and `dist` are already git-ignored)

**Interfaces:**
- Produces: `prototypes/admin-console/src/components/ui/*`, `src/styles.css`, and `src/hooks/use-mobile.ts` in git, for Task 2 to copy.

- [ ] **Step 1: Add `"prototypes/**"` to the `ignores` array in `eslint.config.js`, and `prototypes` to `.prettierignore`**

- [ ] **Step 2: Verify the repo checks ignore it**

Run: `bun run lint`
Expected: no errors, and none mention `prototypes/`.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js .prettierignore prototypes/admin-console
git commit -m "chore: track the admin console prototype as a reference

Refs ARQ-294"
```

Confirm with `git show --stat HEAD | grep -c node_modules` that the count is `0`.

---

### Task 2: Foundation: components, theme, and dark mode

**Files:**
- Modify: `apps/admin/package.json`, `bun.lock`
- Modify: `apps/admin/vite.config.ts`, `apps/admin/tsconfig.json`, `vitest.config.ts` (`@` alias)
- Create: `apps/admin/src/components/ui/*` (copied), `apps/admin/src/hooks/use-mobile.ts`, `apps/admin/src/lib/utils.ts`
- Create: `apps/admin/src/lib/theme.ts`, `apps/admin/src/lib/theme.test.ts`
- Rewrite: `apps/admin/src/styles.css`
- Modify: `apps/admin/src/main.tsx`, `apps/admin/src/test/setup.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils`.
- Produces: `applyStoredTheme(): void`, called before render, and `useTheme(): { dark: boolean; toggle: () => void }`, from `@/lib/theme`. Storage key `wirdak.admin.theme`, values `"light"` or `"dark"`. No stored value follows `prefers-color-scheme`. The `.dark` class goes on `document.documentElement`.

- [ ] **Step 1: Write the failing tests in `apps/admin/src/lib/theme.test.ts`**

```ts
describe("theme", () => {
  it("follows the system when nothing is stored", () => {
    mockSystem("dark");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
  it("a stored choice beats the system", () => {
    mockSystem("dark");
    localStorage.setItem("wirdak.admin.theme", "light");
    applyStoredTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
  it("toggle stores the choice", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(localStorage.getItem("wirdak.admin.theme")).not.toBeNull();
  });
  it("still renders when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => applyStoredTheme()).not.toThrow();
  });
});
```

`mockSystem(scheme)` stubs `window.matchMedia` so `(prefers-color-scheme: dark)` matches when `scheme` is `"dark"`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run --project admin apps/admin/src/lib/theme.test.ts`
Expected: FAIL, cannot resolve `./theme`.

- [ ] **Step 3: Install dependencies in `apps/admin`**

Run: `bun add --cwd apps/admin radix-ui lucide-react class-variance-authority clsx tailwind-merge sonner cmdk tw-animate-css`
Expected: `bun.lock` changes, and the versions match `prototypes/admin-console/package.json`.

- [ ] **Step 4: Add the `@` alias**

Point `@` at `apps/admin/src` in `apps/admin/vite.config.ts`, in `paths` in `apps/admin/tsconfig.json` (`"@/*": ["./src/*"]`), and in the admin project of `vitest.config.ts`.

- [ ] **Step 5: Copy the components**

Copy `prototypes/admin-console/src/components/ui/`, `src/hooks/use-mobile.ts`, and `src/lib/utils.ts` into `apps/admin/src/`. Keep the prototype's fixes: imports from `@/lib/utils`, Arabic `sr-only` labels, the sheet slide directions, and the `try`/`catch` around the sidebar cookie. Run `bunx prettier --write apps/admin/src/components/ui apps/admin/src/hooks`.

- [ ] **Step 6: Rewrite `apps/admin/src/styles.css`**

Start from the prototype's tokens, `@theme inline` block, and base layer. Remove `@import "../../web/src/styles.css"` but keep every `@source` line, because rota pages still render `@web` classes. Drop the prototype's `html body` rule: that was only for the artifact wrapper, so keep `body` styles in `@layer base`. Add `html.dark { color-scheme: dark; }`.

Add an aliases block, marked for removal in plan 2, so old classes keep working in both themes:

```css
/* Until plan 2 rebuilds the rota pages: the website's tokens, on the console's theme. */
:root {
  --paper: var(--background);
  --paper-2: var(--muted);
  --ink: var(--foreground);
  --ink-soft: var(--muted-foreground);
  --line: var(--border);
  --green: var(--primary);
  --green-deep: var(--primary);
  --gold: var(--sidebar-primary);
  --wa: var(--good);
}
```

Add `--color-paper`, `--color-paper-2`, `--color-ink`, `--color-ink-soft`, `--color-line`, `--color-green`, `--color-green-deep`, `--color-gold`, `--color-wa`, `--radius-ui`, and `--font-quran` to `@theme inline`, plus `.animate-sheet-fade`, `.animate-sheet-up`, and the `toast-shrink` keyframes from `apps/web/src/styles.css`.

- [ ] **Step 7: Implement `apps/admin/src/lib/theme.ts`**

Wrap every storage access in `try`/`catch`. `useTheme` keeps `dark` in state and writes the class and storage on toggle.

- [ ] **Step 8: Call `applyStoredTheme()` in `apps/admin/src/main.tsx` before `createRoot`, and wrap `<App />` in `Direction.Provider dir="rtl"` from `radix-ui`**

- [ ] **Step 9: Add jsdom stand-ins to `apps/admin/src/test/setup.ts`**

Add a default `window.matchMedia` returning `matches: false`, a no-op `ResizeObserver`, and no-op `Element.prototype.hasPointerCapture`, `setPointerCapture`, `releasePointerCapture`, and `scrollIntoView`. Radix and the sidebar need these under jsdom.

- [ ] **Step 10: Run the checks**

Run: `bunx vitest run --project admin`
Expected: PASS, including the theme tests.

Run: `bun run typecheck && bun run lint && bun run --cwd=apps/admin build`
Expected: all succeed.

- [ ] **Step 11: Commit**

```bash
git add apps/admin bun.lock vitest.config.ts
git commit -m "feat(admin): add shadcn components, the console theme, and dark mode

Refs ARQ-294"
```

---

### Task 3: Console layout

**Files:**
- Create: `apps/admin/src/components/nav.ts`, `AppSidebar.tsx`, `TopBar.tsx`, `BottomBar.tsx`, `HelpBadge.tsx` (all in `components/`)
- Rewrite: `apps/admin/src/components/Layout.tsx`
- Create: `apps/admin/src/components/Layout.test.tsx`
- Modify: `apps/admin/src/App.tsx` only if `actions` needs a new home

**Interfaces:**
- Consumes: `useTheme` (Task 2), `useIsMobile`.
- Produces: `NAV`, the 7 existing destinations in the same order with the same labels, grouped as daily (home, help), people (search, organizers), and system (settings, audit, admins). Each has `to`, `label` from `t.nav`, and a `lucide-react` icon. Group labels come from `t.shell.groups`.
- Produces: `Layout({ actions }: { actions?: ReactNode })`, the same props as today. `actions` renders in the sidebar footer on desktop and in the top bar on a phone.

- [ ] **Step 1: Write the failing tests in `Layout.test.tsx`**

Mock `convex/react` so `useQuery` returns `{ open: n }` for `adminHelp:counts`, and render at a path inside `MemoryRouter`. Force phone width by stubbing `matchMedia` and `innerWidth`.

```tsx
it("links to every page", () => {
  renderAt("/");
  for (const label of Object.values(t.nav)) {
    expect(screen.getAllByRole("link", { name: new RegExp(label) }).length).toBeGreaterThan(0);
  }
});
it("marks the current page", () => {
  renderAt("/audit");
  expect(screen.getByRole("link", { name: t.nav.audit })).toHaveAttribute("aria-current", "page");
});
it("shows the open help count", () => {
  counts.open = 7;
  renderAt("/");
  expect(screen.getByText("٧")).toBeInTheDocument();
});
it("caps a large help count", () => {
  counts.open = 100;
  renderAt("/");
  expect(screen.getByText(t.help.manyOpen)).toBeInTheDocument();
});
it("on a phone, shows four tabs and more", () => {
  setPhone();
  renderAt("/");
  const bar = screen.getByRole("navigation", { name: t.shell.navLabel });
  expect(within(bar).getAllByRole("link")).toHaveLength(4);
  expect(within(bar).getByRole("button", { name: t.shell.more })).toBeInTheDocument();
});
it("on a phone, marks more as active for a page behind it", () => {
  setPhone();
  renderAt("/audit");
  const more = screen.getByRole("button", { name: t.shell.more });
  expect(more).toHaveAttribute("data-active", "true");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run --project admin apps/admin/src/components/Layout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add a new `t.shell` to `apps/admin/src/i18n/ar.ts`**

`navLabel: "التنقل"`, `more: "المزيد"`, `toggleTheme: "تبديل المظهر"`, `toggleSidebar: "طي القائمة"`, and `groups: { daily: "العمل اليومي", people: "البحث والأشخاص", system: "النظام" }`. Keep these out of `t.nav`, whose values the test treats as the list of pages.

- [ ] **Step 4: Implement the components**

Follow the prototype's `AppSidebar`, `TopBar`, and `BottomBar` in `prototypes/admin-console/src/App.tsx`, using `NavLink` through `SidebarMenuButton asChild` instead of `go()`. Use `<Sidebar side="left" collapsible="icon">`. Top bar: `SidebarTrigger` on desktop, the wordmark on a phone, the page title, the theme toggle. Phone tabs: home, help, search, organizers. `المزيد` opens the sidebar sheet with `setOpenMobile(true)` and sets `data-active` when the route isn't one of the four. `HelpBadge` holds today's `OpenHelpBadge` logic.

Page body: `<main className="mx-auto w-full min-w-0 max-w-[1400px] px-4 pt-4 pb-24 md:px-5 md:pb-10">`. Keep `pb-[env(safe-area-inset-bottom)]` on the phone bar.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run --project admin`
Expected: PASS, including `App.test.tsx`.

- [ ] **Step 6: Check it by eye**

Start the admin app with `bun run dev`, open it at 1440px and 375px, and confirm the sidebar sits on the right, collapses, and opens as a sheet on a phone.

- [ ] **Step 7: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): add the console sidebar, top bar, and phone bar

Refs ARQ-294"
```

---

### Task 4: Shared admin pieces

**Files:**
- Create: `apps/admin/src/components/PageHeader.tsx`, `Pill.tsx`, `DetailList.tsx`
- Create: `apps/admin/src/components/ConfirmSheet.test.tsx`
- Modify: `apps/admin/src/components/ConfirmSheet.tsx`, `StatTile.tsx`, `TrendChart.tsx`, `RotaSwitch.tsx`

**Interfaces:**
- Produces: `PageHeader({ title, description?, actions? })` renders an `h1` with `title`.
- Produces: `Pill({ tone?: "neutral" | "good" | "warn" | "bad" | "info", children })` and `DetailList({ rows: [string, ReactNode][] })`, copied from `prototypes/admin-console/src/components/common.tsx`.
- `ConfirmSheet` keeps its exact props.
- `StatTile` keeps its props, `data-testid`, and `data-tone`.

- [ ] **Step 1: Write the failing tests in `ConfirmSheet.test.tsx`**

```tsx
it("passes the trimmed note to confirm", async () => {
  const onConfirm = vi.fn();
  render(<ConfirmSheet title="عنوان" body="نص" confirmLabel="تأكيد" onConfirm={onConfirm} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(t.ops.noteLabel), "  سبب  ");
  await user.click(screen.getByRole("button", { name: "تأكيد" }));
  expect(onConfirm).toHaveBeenCalledWith("سبب");
});
it("passes undefined for an empty note", async () => { /* same, no typing; expects undefined */ });
it("Enter in the note adds a line and doesn't confirm", async () => {
  const onConfirm = vi.fn();
  render(<ConfirmSheet title="عنوان" body="نص" confirmLabel="تأكيد" onConfirm={onConfirm} onClose={vi.fn()} />);
  await user.type(screen.getByLabelText(t.ops.noteLabel), "سطر{Enter}");
  expect(onConfirm).not.toHaveBeenCalled();
});
it("Escape closes without confirming", async () => { /* expects onClose called, onConfirm not */ });
it("keeps the confirm button off while disabled", () => { /* disabled prop; button toBeDisabled */ });
```

- [ ] **Step 2: Run the test to verify it fails or passes for the right reason**

Run: `bunx vitest run --project admin apps/admin/src/components/ConfirmSheet.test.tsx`
Expected: the behavior tests may pass on the old `Sheet`. They're regression tests, so keep them either way.

- [ ] **Step 3: Rebuild `ConfirmSheet` on shadcn `Dialog`, `Button`, `Label`, and `Textarea`, with `maxLength={500}` kept**

- [ ] **Step 4: Restyle `StatTile`, `TrendChart`, and `RotaSwitch`, and add `PageHeader`, `Pill`, and `DetailList`**

`RotaSwitch` keeps its visible on and off words and its accessible name. `TrendChart` keeps its data and tests, with colors from `--chart-1` and `--muted-foreground`.

- [ ] **Step 5: Run the tests**

Run: `bunx vitest run --project admin`
Expected: PASS. If a page test finds the dialog differently, adjust only how it locates the dialog.

- [ ] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): rebuild the confirm dialog and shared pieces on shadcn

Refs ARQ-294"
```

---

### Task 5: Home, search, organizers, admins, and audit

**Files:**
- Modify: `apps/admin/src/pages/HomePage.tsx`, `SearchPage.tsx`, `OrganizersPage.tsx`, `AdminsPage.tsx`, `AuditPage.tsx`
- Modify: `apps/admin/src/components/AdminPushCard.tsx`

**Interfaces:**
- Consumes: `PageHeader`, `Pill` (Task 4), and `components/ui/*`.

Restyling means: replace `font-display text-3xl` headings with `PageHeader`, `@web` `Button` with shadcn `Button`, hand-rolled inputs with `Input` and `Label`, `rounded-ui border-2` cards with `rounded-lg border bg-card`, and result lists with shadcn `Table` on desktop where the page shows rows. Keep each page's JSX order, conditions, and handlers.

Keep exactly: the `h1` text, `Link` names such as `t.organizers.createFor`, and `dir="ltr"` on numbers. `e2e/admin-rota.spec.ts` uses these.

- [ ] **Step 1: Restyle the five pages and the push card**

- [ ] **Step 2: Run the page tests**

Run: `bunx vitest run --project admin apps/admin/src/pages/HomePage.test.tsx apps/admin/src/pages/SearchPage.test.tsx apps/admin/src/pages/OrganizersPage.test.tsx apps/admin/src/pages/AdminsPage.test.tsx apps/admin/src/pages/AuditPage.test.tsx apps/admin/src/components/AdminPushCard.test.tsx`
Expected: PASS with no assertion weakened.

- [ ] **Step 3: Confirm no `@web` component remains in these files**

Run: `grep -n '@web/components' apps/admin/src/pages/HomePage.tsx apps/admin/src/pages/SearchPage.tsx apps/admin/src/pages/OrganizersPage.tsx apps/admin/src/pages/AdminsPage.tsx apps/admin/src/pages/AuditPage.tsx apps/admin/src/components/AdminPushCard.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): restyle home, search, organizers, admins, and audit

Refs ARQ-294"
```

---

### Task 6: Help inbox and conversation

**Files:**
- Modify: `apps/admin/src/pages/HelpInboxPage.tsx`, `HelpRequestPage.tsx`

Same restyling rules as Task 5. Keep the current two-page flow. The three-pane inbox is plan 4. The `<audio>` player, screenshots, and "deleted" attachment states stay as they are.

- [ ] **Step 1: Restyle both pages, with reply on shadcn `Textarea` and `Button`**

- [ ] **Step 2: Run the tests**

Run: `bunx vitest run --project admin apps/admin/src/pages/HelpInboxPage.test.tsx apps/admin/src/pages/HelpRequestPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): restyle the help inbox and conversation

Refs ARQ-294"
```

---

### Task 7: Settings

**Files:**
- Modify: `apps/admin/src/pages/SettingsPage.tsx`, `apps/admin/src/components/SettingField.tsx`

**Interfaces:**
- `SettingField({ setting })`, `SettingList({ rows })`, `SettingRow`, and `parseTab` keep their exports and shapes. `formatSetting`, `SETTING_LAYOUT`, and `adminSettings.*` don't change.

Follow the look of `prototypes/admin-console/src/pages/SettingsPage.tsx`, but keep the real page's logic: `useSearchParams`, the `listed` ref, arrow-key tab movement for right-to-left, the `fold` search, and the save and reset calls. The editor stays in `SettingField`.

The grace editor uses `@web/components/GraceField` today. Keep it in this plan, since its colors resolve through the aliases. Replace `@web` `Sheet` and `Button` with shadcn `Sheet` and `Button`, using `side="right"` on desktop and `side="bottom"` on a phone.

- [ ] **Step 1: Restyle both files**

- [ ] **Step 2: Run the tests**

Run: `bunx vitest run --project admin apps/admin/src/pages/SettingsPage.test.tsx apps/admin/src/components/SettingField.test.tsx apps/admin/src/lib/settingLayout.test.ts apps/admin/src/lib/formatSetting.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): restyle settings

Refs ARQ-294"
```

---

### Task 8: Person, khatma, and sign-in pages

**Files:**
- Modify: `apps/admin/src/pages/PersonAdminPage.tsx`, `KhatmaAdminPage.tsx`, `SignInPage.tsx`, `AlertSignOutPage.tsx`

Same restyling rules as Task 5. On `PersonAdminPage` and `KhatmaAdminPage`, use `DetailList` and `Pill`. The Task 2 aliases keep `@web` helpers such as `formatIsoDate` working, and logic imports stay.

Sign-in gets a centered card on the console background, with the wordmark in Aref Ruqaa. Keep its steps, code input, and error text unchanged.

- [ ] **Step 1: Restyle the four pages**

- [ ] **Step 2: Run the tests**

Run: `bunx vitest run --project admin apps/admin/src/pages/PersonAdminPage.test.tsx apps/admin/src/pages/KhatmaAdminPage.test.tsx apps/admin/src/pages/SignInPage.test.tsx apps/admin/src/pages/AlertSignOutPage.test.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): restyle person, khatma, and sign-in pages

Refs ARQ-294"
```

---

### Task 9: Layout proof and final checks

**Files:**
- Create: `e2e/admin-layout.spec.ts`
- Modify: `playwright.config.ts` (add `"**/admin-layout.spec.ts"` beside `DESKTOP_CHROME_ONLY`, so both admin specs run only on `desktop-chrome`; the spec sets its own viewports)

**Interfaces:**
- Consumes: `adminSession(phone)` from `e2e/support.ts`, signing in the way `e2e/admin-rota.spec.ts` does. Wrap that in `signInAsAdmin(page)` in `e2e/support.ts`.

- [ ] **Step 1: Write `e2e/admin-layout.spec.ts`**

```ts
for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`no sideways scroll at ${viewport.width} in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await signInAsAdmin(page);
      for (const path of ["/", "/help", "/search", "/organizers", "/settings", "/audit", "/admins"]) {
        await page.goto(`${ADMIN_URL}${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBe(0);
      }
    });
  }
}

test("a very long name stays inside its row on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAsAdmin(page);
  await createRotaForOrganizer(page, { organizerName: "عبد".repeat(20) });
  await page.goto(`${ADMIN_URL}/organizers`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
```

`createRotaForOrganizer` is the first steps of `e2e/admin-rota.spec.ts`, extracted to `e2e/support.ts`. `organizerName` has `maxLength={60}`, so the name above fits.

- [ ] **Step 2: Run the end-to-end tests**

Stop `bun run dev` first, because the ports are shared.

Run: `bun run e2e --project=desktop-chrome e2e/admin-layout.spec.ts e2e/admin-rota.spec.ts`
Expected: PASS. Fix any page that overflows with `grid-cols-1` or `min-w-0`.

- [ ] **Step 3: Confirm what's left on the website's components**

Run: `grep -rln '@web/components' apps/admin/src | grep -v test`
Expected: only `SettingField.tsx` for `GraceField`, the rota pages, `main.tsx` for `ErrorBoundary`, and files importing `RetryBoundary` or other non-visual helpers. Anything else goes back to its task.

- [ ] **Step 4: Run everything**

Run: `bun run typecheck && bun run lint && bun run test && bun run --cwd=apps/admin build`
Expected: all succeed.

- [ ] **Step 5: Check the commit messages**

Run: `git log main..HEAD --format=%B | grep -iE 'co-authored-by:.*(claude|anthropic)|generated with.*claude code|claude-session'`
Expected: no output.

- [ ] **Step 6: Commit, then open the pull request**

```bash
git add e2e playwright.config.ts
git commit -m "test(admin): prove the console fits at every width in both themes

Refs ARQ-294"
```

Push the branch and open a pull request titled `feat(admin): move the panel to the console shell`, with `ARQ-294` in the body. Then run the `/review` skill on it and fix confirmed issues before handing it over, as the global rules require. Test on staging. Production waits for Ali to merge and release.
