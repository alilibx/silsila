# Wirdak mobile navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom bar, a khatma switcher, and khatma section tabs so the website moves like a mobile app.

**Architecture:** A `BottomBar` mounts once in `App.tsx` and decides from the route, the session, and a hide counter whether to show. It publishes its measured height as the CSS variable `--nav-h`, which the page padding and the toast read. `KhatmaPage` keeps today's single page for non-members and signed-out visitors. For members it renders a new header (back link, switch button), a `KhatmaTabs` tablist driven by `?tab=`, and one tab panel at a time.

**Tech Stack:** React 19, React Router 8, Tailwind 4, Convex React, Vitest with Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-wirdak-mobile-navigation-design.md`

## Global Constraints

- All UI text lives in `apps/web/src/i18n/ar.ts`. No Arabic literals in `components/`, `pages/`, or `features/verify/` (`components/layout.node.test.ts` enforces this).
- Direction-neutral CSS only: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right` in those folders.
- Base text at least 18px (`1rem` here), main buttons and tabs at least 56px tall (`min-h-14`), back links at least 44px (`min-h-11`).
- Every icon has a word. No swipe, long-press, or hidden menus.
- Commits use Conventional Commits, end with `Refs ARQ-277`, and carry no AI attribution (see `CLAUDE.md`).

## Review Focus

1. **Largest phone text size:** bar labels wrap to two lines and the bar grows. `--nav-h` must follow the real height so the last item and the toast stay visible. Pinned in Task 1 (`--nav-h follows the bar's measured height`).
2. **A dead stored token** (`api.sessions.me` answers `null`): the person is signed out, so no bar. Pinned in Task 1 (`hides for a signed-out person`).
3. **A failed take** (someone else took the juz' first): the page stays on الأجزاء so the person can pick another. Pinned in Task 4 (`stays on the pool tab when the take fails`).
4. **`mine` without the current khatma** (the person was just removed, or `mine` is still loading): no crash, no check mark on a stranger, and the switch button follows the count of the other khatmas. Pinned in Task 5 (`hides the switch button while mine loads` and `marks nothing when the current khatma is missing`).
5. **A non-member opens `?tab=group`** (an organizer's link copied with the parameter): they still get the single page, with the grid visible. Pinned in Task 4 (`ignores ?tab for a non-member`).

---

### Task 1: The bottom bar component

**Files:**
- Create: `apps/web/src/features/nav/bottomBarUi.tsx`
- Create: `apps/web/src/components/BottomBar.tsx`
- Modify: `apps/web/src/i18n/ar.ts` (add a `nav` section)
- Modify: `apps/web/src/styles.css` (bottom padding from `--nav-h`)
- Modify: `apps/web/src/components/Toast.tsx:48` (sit above the bar)
- Test: `apps/web/src/components/BottomBar.test.tsx`

**Interfaces:**
- Produces:
  - `BottomBarProvider({ children }: { children: ReactNode })`, `useBottomBarHidden(): boolean`, `useHideBottomBar(): void` in `features/nav/bottomBarUi.tsx`. Same counter pattern as `HelpProvider`/`useHideHelpButton` in `features/help/helpUi.tsx`. Outside the provider, `useBottomBarHidden()` returns `false` and `useHideBottomBar()` does nothing.
  - `BottomBar(): JSX.Element | null` in `components/BottomBar.tsx`.
  - `t.nav = { label: "التنقل", home: "ختماتي", create: "ختمة جديدة", settings: "إعداداتي", back: "ختماتي", switchKhatma: "تبديل الختمة", switchTitle: "اختر ختمة", tabs: { label: "أقسام الختمة", mine: "جزئي", pool: "الأجزاء", group: "المجموعة" } }`.
  - CSS variable `--nav-h` on `document.documentElement`: the bar's height in px while it shows, removed when it hides.

- [ ] **Step 1: Write the failing tests** in `BottomBar.test.tsx`. Mock `convex/react` `useQuery` by function name (`sessions:me` returns a `me` mock, `khatmas:mine` returns a `mine` mock) and `../lib/session`, as `pages/HomePage.test.tsx` does. Render `<MemoryRouter initialEntries={[url]}><BottomBarProvider><BottomBar /></BottomBarProvider></MemoryRouter>`.

```tsx
it("shows three labelled links for a signed-in person on home", () => {
  renderAt("/");
  const nav = screen.getByRole("navigation", { name: "التنقل" });
  expect(within(nav).getByRole("link", { name: "ختماتي" })).toHaveAttribute("href", "/");
  expect(within(nav).getByRole("link", { name: "ختمة جديدة" })).toHaveAttribute("href", "/new");
  expect(within(nav).getByRole("link", { name: "إعداداتي" })).toHaveAttribute("href", "/settings");
});
it.each([
  ["/", "ختماتي"], ["/j/CODE", "ختماتي"], ["/new", "ختمة جديدة"], ["/settings", "إعداداتي"],
])("marks the active link on %s", (url, name) => {
  renderAt(url);
  expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-current", "page");
  expect(screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(1);
});
it("hides for a signed-out person", () => {           // me === null, including a dead stored token
  me.mockReturnValue(null);
  renderAt("/");
  expect(screen.queryByRole("navigation")).toBeNull();
});
it("hides while the session is loading", () => { me.mockReturnValue(undefined); /* ... */ });
it.each(["/j/CODE/settings", "/signout"])("hides on %s", (url) => { /* no navigation */ });
it("shows on an unknown path", () => { renderAt("/nope"); /* navigation present */ });
it("hides while a screen calls useHideBottomBar", () => { /* render a child that calls the hook */ });
it("adds the new-message dot to ختماتي when a khatma has a note", () => {
  mine.mockReturnValue([{ ...card, hasNote: true }]);
  renderAt("/settings");
  expect(screen.getByRole("link", { name: "ختماتي، رسالة جديدة" })).toBeInTheDocument();
});
it("--nav-h follows the bar's measured height", () => {
  // Stub ResizeObserver to call back with the nav element; stub its getBoundingClientRect().height to 72, then 110.
  renderAt("/");
  expect(document.documentElement.style.getPropertyValue("--nav-h")).toBe("72px");
  // trigger the observer again after the height change
  expect(document.documentElement.style.getPropertyValue("--nav-h")).toBe("110px");
});
it("clears --nav-h when it hides", () => { /* unmount → property is "" */ });
```

The dot's accessible name is `` `${t.nav.home}${t.common.listSeparator}${t.notes.newMessage}` ``. Check `t.notes.newMessage` reads "رسالة جديدة" before hard-coding it in the test; if it differs, assert the composed string from `t`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `bunx vitest run --project web apps/web/src/components/BottomBar.test.tsx`
Expected: FAIL, cannot resolve `./BottomBar`.

- [ ] **Step 3: Implement `bottomBarUi.tsx`, the `t.nav` strings, and `BottomBar`**

- Visibility: show only when `useQuery(api.sessions.me, { sessionToken })` is a non-null object, `useBottomBarHidden()` is false, and the pathname is neither `/signout` nor matches `/j/:inviteCode/settings` (use `matchPath`).
- Active link: `/` and `/j/:inviteCode` → ختماتي, `/new` → ختمة جديدة, `/settings` → إعداداتي, anything else → none.
- Dot: `useQuery(api.khatmas.mine, { sessionToken })?.some((k) => k.hasNote)`. Same saffron dot markup as `HomePage`'s `KhatmaCard`, `aria-hidden`, with the words carried by an `aria-label` on the link.
- Markup: `<nav aria-label={t.nav.label} className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">` with an inner `mx-auto flex max-w-xl` row of three `flex-1 min-h-14` links, each an inline SVG icon (`aria-hidden`, `currentColor`, about 24px) above its word. Active: `text-green font-semibold`; others `text-ink-soft`. Labels may wrap (`text-center leading-tight`).
- Height: a `ResizeObserver` on the nav sets `document.documentElement.style.setProperty("--nav-h", `${Math.ceil(height)}px`)`; the effect cleanup disconnects it and calls `removeProperty("--nav-h")`.
- z-index stays below the sheet (`z-20`) and the toast (`z-30`).

- [ ] **Step 4: Make room for the bar in `styles.css` and `Toast.tsx`**

- In `@layer base`, on the existing `body` rule: `padding-bottom: var(--nav-h, 0px);`. It goes on `body`, not `main`, because every page's `main` has a `p-5` utility that would beat a base style.
- `Toast.tsx:48`: replace `bottom-5` with `bottom-[calc(1.25rem+var(--nav-h,0px))]`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `bunx vitest run --project web apps/web/src/components/`
Expected: PASS, including `layout.node.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/nav apps/web/src/components/BottomBar.tsx apps/web/src/components/BottomBar.test.tsx apps/web/src/components/Toast.tsx apps/web/src/i18n/ar.ts apps/web/src/styles.css
git commit -m "feat(web): add the bottom bar" -m "Refs ARQ-277"
```

### Task 2: Mount the bar and tidy the page headers

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/CelebrationPage.tsx:30`
- Modify: `apps/web/src/pages/HomePage.tsx` (header)
- Modify: `apps/web/src/pages/SettingsPage.tsx:58-65`
- Modify: `apps/web/src/pages/CreatePage.tsx:98-105`
- Test: `apps/web/src/pages/HomePage.test.tsx`, `SettingsPage.test.tsx`, `CreatePage.test.tsx`, `CelebrationPage.test.tsx`

**Interfaces:**
- Consumes: `BottomBarProvider`, `useHideBottomBar`, `BottomBar` from Task 1.

- [ ] **Step 1: Write the failing tests**

```tsx
// HomePage.test.tsx: signed in
expect(screen.queryByRole("link", { name: "إعداداتي" })).toBeNull();
// SettingsPage.test.tsx: signed in → no top home link; signed out → keeps it
expect(screen.queryByRole("link", { name: "الصفحة الرئيسية" })).toBeNull();
// CreatePage.test.tsx: token present → no t.create.back link; no token → link to "/" stays
// CelebrationPage.test.tsx: render inside BottomBarProvider with a probe that reads useBottomBarHidden()
expect(probe).toHaveTextContent("hidden");
```

Update any existing test in these files that expects the removed links.

- [ ] **Step 2: Run them to see them fail**

Run: `bunx vitest run --project web apps/web/src/pages/HomePage.test.tsx apps/web/src/pages/SettingsPage.test.tsx apps/web/src/pages/CreatePage.test.tsx apps/web/src/pages/CelebrationPage.test.tsx`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

- `App.tsx`: wrap the `HelpProvider` children in `<BottomBarProvider>` and render `<BottomBar />` after `<Routes>`, inside `HandoffGate` (so it hides behind the gate like everything else).
- `CelebrationPage.tsx`: call `useHideBottomBar()` beside `useHideHelpButton()`.
- `HomePage.tsx`: drop the `/settings` link from the header. The "وِردك" title stays.
- `SettingsPage.tsx`: render the header link only when `me === null`.
- `CreatePage.tsx`: render the back link only when `signedIn` is false.

- [ ] **Step 4: Run them to see them pass**, then the whole web suite

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): show the bottom bar and drop the duplicate header links" -m "Refs ARQ-277"
```

### Task 3: The khatma tabs control

**Files:**
- Create: `apps/web/src/components/KhatmaTabs.tsx`
- Test: `apps/web/src/components/KhatmaTabs.test.tsx`

**Interfaces:**
- Produces:
  - `type KhatmaTab = "mine" | "pool" | "group"`
  - `parseTab(value: string | null): KhatmaTab`: `"pool"` → pool, `"group"` → group, anything else → mine.
  - `tabParam(tab: KhatmaTab): string | null`: mine → `null`, else the tab name.
  - `KhatmaTabs({ tab, onChange, idPrefix }: { tab: KhatmaTab; onChange: (tab: KhatmaTab) => void; idPrefix: string })`. Renders the tablist. Tab ids are `${idPrefix}-tab-${tab}`, and each tab's `aria-controls` is `${idPrefix}-panel`. The panel itself belongs to the page (Task 4).

- [ ] **Step 1: Write the failing tests**

```tsx
it("parses the URL value", () => {
  expect(parseTab(null)).toBe("mine");
  expect(parseTab("pool")).toBe("pool");
  expect(parseTab("group")).toBe("group");
  expect(parseTab("POOL")).toBe("mine");
  expect(tabParam("mine")).toBeNull();
});
it("renders three tabs in order with the selected one marked", () => {
  render(<KhatmaTabs tab="pool" onChange={vi.fn()} idPrefix="k" />);
  expect(screen.getByRole("tablist", { name: "أقسام الختمة" })).toBeInTheDocument();
  expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["جزئي", "الأجزاء", "المجموعة"]);
  expect(screen.getByRole("tab", { name: "الأجزاء" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "الأجزاء" })).toHaveAttribute("aria-controls", "k-panel");
});
it("calls onChange on tap", async () => { /* click المجموعة → onChange("group") */ });
it("moves with arrow keys in reading direction", async () => {
  document.documentElement.dir = "rtl";
  // focus جزئي, ArrowLeft → onChange("pool") and focus moves; ArrowRight from جزئي wraps to "group"; Home → "mine"; End → "group"
});
```

- [ ] **Step 2: Run to see it fail**

Run: `bunx vitest run --project web apps/web/src/components/KhatmaTabs.test.tsx`
Expected: FAIL, cannot resolve `./KhatmaTabs`.

- [ ] **Step 3: Implement `KhatmaTabs`**

Roving tabindex (selected tab `tabIndex=0`, others `-1`). In RTL (`document.documentElement.dir === "rtl"`), ArrowLeft is next and ArrowRight is previous; in LTR the reverse. Arrows wrap. Selecting by key also calls `onChange`. Style from the spec: `rounded-ui bg-paper-2 p-1` track, each tab `flex-1 min-h-14`, selected `bg-card text-green-deep font-semibold`, others `text-ink-soft`.

- [ ] **Step 4: Run to see it pass**

Run: `bunx vitest run --project web apps/web/src/components/KhatmaTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/KhatmaTabs.tsx apps/web/src/components/KhatmaTabs.test.tsx
git commit -m "feat(web): add the khatma tabs control" -m "Refs ARQ-277"
```

### Task 4: The tabbed khatma page for members

**Files:**
- Modify: `apps/web/src/pages/KhatmaPage.tsx` (`KhatmaContent`, the `useKhatmaActions` call)
- Modify: `apps/web/src/features/khatma/useKhatmaActions.ts:86-89, 245-262`
- Modify: `apps/web/src/components/MainCard.tsx:92-99`
- Modify: `apps/web/src/pages/OrganizerPage.tsx:215-222` (back link)
- Test: `apps/web/src/pages/KhatmaPage.test.tsx` (new `describe("tabs")`), `KhatmaPage.actions.test.tsx`, `KhatmaPage.share.test.tsx`, `KhatmaPage.push.test.tsx`, `OrganizerPage.test.tsx`

**Interfaces:**
- Consumes: `KhatmaTabs`, `parseTab`, `tabParam`, `KhatmaTab` from Task 3; `t.nav` from Task 1.
- Produces:
  - `useKhatmaActions(view, inviteCode, options?: { onTaken?: (juz: number) => void })`. `onTaken` runs only when `takeMutation` returns `ok`.
  - `MainCard` gains an optional prop `onPickYourself?: () => void`. When it's set, "اختر بنفسك" is a `<button>` with the same classes that calls it. When it's not set, it stays the `href="#pool"` anchor.

- [ ] **Step 1: Write the failing tests** in `KhatmaPage.test.tsx`. Use the existing `renderAt` and `makeView`. For URL checks, add a `<Route path="*" element={<LocationProbe />} />` sibling or render a probe that prints `useLocation().search`.

```tsx
describe("tabs", () => {
  it("a member lands on جزئي with the ring and main card, and no grid", () => {
    useQuery.mockReturnValue(makeView());
    renderAt("/j/CODE");
    expect(screen.getByRole("tab", { name: "جزئي" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", expect.stringContaining("tab-mine"));
    expect(screen.queryByRole("heading", { name: "الأجزاء الثلاثون" })).toBeNull();
  });
  it("?tab=pool shows the grid", () => { /* heading الأجزاء الثلاثون present, no main card */ });
  it("?tab=group shows invite, the notifications switch and the group total", () => {
    useQuery.mockReturnValue(makeView({ completedRounds: 3 }));
    renderAt("/j/CODE?tab=group");
    expect(screen.getByRole("button", { name: t.share.inviteButton })).toBeInTheDocument();
    expect(screen.getByText(t.khatma.groupTotal("٣"))).toBeInTheDocument();
  });
  it("shows the organizer's settings link on المجموعة only for the organizer", () => { /* ... */ });
  it("switching tabs replaces the URL and keeps from", async () => {
    renderAt("/j/CODE?from=AB12");
    await user.click(screen.getByRole("tab", { name: "الأجزاء" }));
    expect(search()).toBe("?from=AB12&tab=pool");
    // history length unchanged: MemoryRouter + a probe reading useNavigationType() === "REPLACE"
  });
  it("the back link says ختماتي and goes home", () => {
    expect(screen.getByRole("link", { name: "ختماتي" })).toHaveAttribute("href", "/");
  });
  it("اختر بنفسك opens الأجزاء", async () => { /* view with me.suggestion = 5 → click t.card.pickYourself → tab pool selected */ });
  it("ignores ?tab for a non-member", () => {
    useQuery.mockReturnValue(makeView({ me: { ...makeView().me, isMember: false } }));
    renderAt("/j/CODE?tab=group");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("heading", { name: "الأجزاء الثلاثون" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.app.name })).toHaveAttribute("href", "/");
  });
  it("a signed-out visitor gets the single page", () => { /* me.signedIn false, isMember false */ });
});
```

In `KhatmaPage.actions.test.tsx`:

```tsx
it("switches to جزئي after a take from الأجزاء", async () => { /* take mutation resolves { ok: true }; start at ?tab=pool, tap an open tile, confirm → tab جزئي selected */ });
it("stays on the pool tab when the take fails", async () => { /* resolves { ok: false, reason: "taken" } → tab الأجزاء still selected */ });
```

In `OrganizerPage.test.tsx`: the back link's `href` is `/j/CODE?tab=group`.

Existing tests in the four `KhatmaPage*.test.tsx` files that find the grid, invite, remind, the notifications switch, or the organizer link for a member now need `?tab=pool` or `?tab=group` in their URL. Update those URLs; don't weaken the assertions.

- [ ] **Step 2: Run to see them fail**

Run: `bunx vitest run --project web apps/web/src/pages/KhatmaPage apps/web/src/pages/OrganizerPage.test.tsx`
Expected: the new tests FAIL. The updated existing tests may pass or fail; nothing else should break.

- [ ] **Step 3: Implement**

- `useKhatmaActions`: add the `options` parameter and call `options?.onTaken?.(juz)` in `confirmTake` right after the `result.ok` capture.
- `KhatmaPage`: read `tab = parseTab(search.get("tab"))`. `setTab(next)` copies the current params, sets or deletes `tab` via `tabParam`, and calls `setSearchParams(params, { replace: true })`. Pass `onTaken: () => setTab("mine")` to `useKhatmaActions`.
- `KhatmaContent`: when `view.me.isMember` is false, render exactly today's markup. When it's true:
  - header: a `Link to="/"` with a start-pointing chevron SVG and `t.nav.back`, `min-h-11`;
  - the title row (`h1` plus a slot for Task 5's switch button), then the chips;
  - `<KhatmaTabs tab={tab} onChange={setTab} idPrefix={…} />` with a `useId()` prefix;
  - one `<section role="tabpanel" id={`${p}-panel`} aria-labelledby={`${p}-tab-${tab}`}>` holding:
    - mine: notes, `Ring`, `MainCard` with `onPickYourself={() => setTab("pool")}`;
    - pool: `PoolGrid`;
    - group: invite, remind (when `hasOpen`), `SwitchRow`, the organizer link, and the `groupTotal` line.
- `MainCard`: the optional `onPickYourself` prop as described in Interfaces.
- `OrganizerPage`: the back link goes to `` `${khatmaPath(inviteCode)}?tab=group` ``.

- [ ] **Step 4: Run to see them pass**, then the whole suite

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(web): split the khatma page into tabs for members" -m "Refs ARQ-277"
```

### Task 5: The switch-khatma sheet

**Files:**
- Create: `apps/web/src/components/SwitchKhatmaSheet.tsx`
- Modify: `apps/web/src/pages/KhatmaPage.tsx` (the title row, a `mine` query, sheet state)
- Test: `apps/web/src/components/SwitchKhatmaSheet.test.tsx`, `apps/web/src/pages/KhatmaPage.test.tsx`

**Interfaces:**
- Consumes: `Sheet` (`components/Sheet.tsx`), `t.nav.switchKhatma`, `t.nav.switchTitle`, and `t.home.doneOf`, `t.home.yours`, `t.home.startNewPlain`, `t.notes.newMessage`.
- Produces: `SwitchKhatmaSheet({ khatmas, currentCode, onClose }: { khatmas: FunctionReturnType<typeof api.khatmas.mine>; currentCode: string; onClose: () => void })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// SwitchKhatmaSheet.test.tsx (inside MemoryRouter)
it("lists every khatma with progress, the held juz' and the note dot", () => { /* names, "١٨ من ٣٠ تمّت", t.home.yours(...), t.notes.newMessage */ });
it("marks the current khatma", () => {
  expect(screen.getByRole("link", { name: /ختمة العائلة/ })).toHaveAttribute("aria-current", "page");
});
it("marks nothing when the current khatma is missing", () => {
  render(<SwitchKhatmaSheet khatmas={[a, b]} currentCode="GONE" onClose={vi.fn()} />);
  expect(screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"))).toHaveLength(0);
});
it("links other khatmas to their page and closes", async () => { /* href "/j/B"; click → onClose called */ });
it("tapping the current khatma only closes", async () => { /* onClose called, no navigation */ });
it("offers to start a new khatma", () => { /* link "ابدأ ختمة جديدة" → "/new" */ });

// KhatmaPage.test.tsx: route "khatmas:mine" in the convex mock to a `mine` mock (default [])
it("shows تبديل الختمة with two or more khatmas, and opens the sheet", async () => { /* ... dialog "اختر ختمة" */ });
it("hides the switch button with one khatma", () => { /* ... */ });
it("hides the switch button while mine loads", () => { mine.mockReturnValue(undefined); /* ... */ });
```

Add the `khatmas:mine` routing to the `convex/react` mock in all four `KhatmaPage*.test.tsx` files (today `useQuery` returns the view for every query except `notes:forKhatma`), so the existing tests keep working.

- [ ] **Step 2: Run to see them fail**

Run: `bunx vitest run --project web apps/web/src/components/SwitchKhatmaSheet.test.tsx apps/web/src/pages/KhatmaPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `SwitchKhatmaSheet`: a `Sheet` titled `t.nav.switchTitle`. One `Link` row per khatma, at least 56px tall, in the given order, with the same name fallback as home (`t.khatma.untitled(formatDate(createdAt))`). The current row gets `border-2 border-green`, a check SVG, `aria-current="page"`, and an `onClick` that prevents navigation and calls `onClose`. Other rows call `onClose` on click and navigate. Then a dashed `Link` to `/new` with `t.home.startNewPlain` in the style of home's "start new" link.
- `KhatmaPage`: `const mine = useQuery(api.khatmas.mine, isMember ? { sessionToken } : "skip")`. The switch button shows when `mine !== undefined && mine.length >= 2`. It's a bordered button (`min-h-11`, `text-green`) on the title row at the end edge, and it opens the sheet. Render the sheet beside the other sheets.

- [ ] **Step 4: Run to see them pass**, then the whole suite

Run: `bun run test && bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/SwitchKhatmaSheet.tsx apps/web/src/components/SwitchKhatmaSheet.test.tsx
git commit -am "feat(web): add the switch-khatma sheet" -m "Refs ARQ-277"
```

### Task 6: End-to-end tests

**Files:**
- Modify: `e2e/core-loop.spec.ts`, `e2e/grace.spec.ts`

**Interfaces:**
- Consumes: the tab names `t.nav.tabs.*`, `t.nav.home`, and `t.nav.switchKhatma`, `t.nav.switchTitle`.

- [ ] **Step 1: Update the specs**

- Before every member-side grid assertion (`core-loop.spec.ts` lines 60, 69, 111-129; `grace.spec.ts` lines 15, 57, 91), click `getByRole("tab", { name: t.nav.tabs.pool })`. Before a main-card action that follows, click `t.nav.tabs.mine`.
- Visitor `b` on the invite link is a non-member until the take, so the first take stays on the single page. After the take, `b` has tabs.
- Add to `core-loop.spec.ts`: person A creates a second khatma from the bar (`getByRole("link", { name: t.nav.create })`), then on the second khatma taps `t.nav.switchKhatma`, picks the first khatma in the `t.nav.switchTitle` dialog, and sees its `h1`.
- Add one bar check: the `navigation` named `t.nav.label` is visible on home for A, and not visible for a fresh signed-out context on `/`.

- [ ] **Step 2: Run e2e**

Stop any running `bun run dev` first.
Run: `bun run e2e`
Expected: all specs pass.

- [ ] **Step 3: Commit**

```bash
git commit -am "test(e2e): cover the tabs, the bottom bar, and switching khatmas" -m "Refs ARQ-277"
```

### After the tasks

- [ ] Run `bun run typecheck && bun run lint && bun run test && bun run build` and see all pass.
- [ ] After the PR merges and staging deploys: check the installed PWA on an iPhone (the bar clears the home indicator) and the largest text size (labels wrap, nothing is cut off, the toast sits above the bar).
