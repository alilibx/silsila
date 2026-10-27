import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KhatmaView } from "@convex/khatmas";
import { t } from "../i18n/ar";
import { makeTiles, makeView } from "../test/fixtures";
import { KhatmaPage } from "./KhatmaPage";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  take: vi.fn(),
  finish: vi.fn(),
  undoFinish: vi.fn(),
  release: vi.fn(),
  markCelebrated: vi.fn(),
  token: undefined as string | undefined,
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => m.token,
  getSessionToken: () => m.token ?? null,
  clearSessionToken: () => {},
}));
vi.mock("../features/verify/VerifySheet", () => ({
  VerifySheet: (props: { title: string; onVerified: () => void }) => (
    <div role="dialog" aria-label={props.title}>
      <button onClick={props.onVerified}>verified</button>
    </div>
  ),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (...args: unknown[]) => m.query(...args),
    useMutation: (ref: never) => {
      const name = getFunctionName(ref).split(":")[1] as
        "take" | "finish" | "undoFinish" | "release" | "markCelebrated";
      return m[name];
    },
  };
});

const tree = () => (
  <MemoryRouter initialEntries={["/j/CODE"]}>
    <Routes>
      <Route path="/j/:inviteCode" element={<KhatmaPage />} />
    </Routes>
  </MemoryRouter>
);

const signedIn = (over: Partial<KhatmaView["me"]> = {}): KhatmaView["me"] => ({
  signedIn: true,
  displayName: "علي",
  isMember: true,
  holding: null,
  suggestion: 3,
  celebrateRound: null,
  ...over,
});

const NOW = Date.UTC(2026, 9, 28, 12);

function setup(view: KhatmaView | undefined) {
  m.query.mockReturnValue(view);
  const raw = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // A click starts a server call; let its promise and the resulting render settle before asserting.
  const user = {
    click: async (element: Element) => {
      await raw.click(element);
      await act(async () => {});
    },
  };
  const utils = render(tree());
  return {
    user,
    ...utils,
    show: (next: KhatmaView | undefined) => {
      m.query.mockReturnValue(next);
      utils.rerender(tree());
    },
  };
}

const toast = () => screen.getByRole("status");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // Testing Library only drives fake timers it can see through a `jest` global.
  vi.stubGlobal("jest", {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  });
  vi.setSystemTime(NOW);
  m.token = "tok";
  for (const fn of [
    m.query,
    m.take,
    m.finish,
    m.undoFinish,
    m.release,
    m.markCelebrated,
  ]) {
    fn.mockReset();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("take", () => {
  it("opens the take sheet for the suggestion and takes it", async () => {
    m.take.mockResolvedValue({ ok: true });
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    const sheet = screen.getByRole("dialog", { name: "الجزء ٣" });
    expect(sheet).toHaveTextContent("يبدأ من سورة");
    await user.click(
      within(sheet).getByRole("button", { name: "نعم، هذا جزئي" }),
    );
    expect(m.take).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      juz: 3,
    });
    expect(toast()).toHaveTextContent("الجزء ٣ لك الآن. يسّر الله لك");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the sheet for the tile that was tapped, and 'not now' closes it", async () => {
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: /^الجزء ٩،/ }));
    const sheet = screen.getByRole("dialog", { name: "الجزء ٩" });
    await user.click(within(sheet).getByRole("button", { name: "ليس الآن" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.take).not.toHaveBeenCalled();
  });

  it("taken shows the race toast, then reopens with the new suggestion once the view updates", async () => {
    m.take.mockResolvedValue({ ok: false, reason: "taken" });
    const { user, show } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    expect(toast()).toHaveTextContent("سبقك أحدهم إليه. اخترنا لك غيره.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    show(
      makeView({
        tiles: makeTiles({ 3: { state: "reading", readerName: "سارة" } }),
        me: signedIn({ suggestion: 4 }),
      }),
    );
    expect(screen.getByRole("dialog", { name: "الجزء ٤" })).toBeInTheDocument();
  });

  it("taken with nothing left open closes the sheet and leaves the all-taken card", async () => {
    m.take.mockResolvedValue({ ok: false, reason: "taken" });
    const { user, show } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    show(
      makeView({
        tiles: makeTiles(
          Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [
              i + 1,
              { state: "reading" as const },
            ]),
          ),
        ),
        me: signedIn({ suggestion: null }),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("كل الأجزاء مأخوذة الآن")).toBeInTheDocument();
  });

  it("khatma_full shows the full-group copy and closes the sheet", async () => {
    m.take.mockResolvedValue({ ok: false, reason: "khatma_full" });
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    expect(toast()).toHaveTextContent("اكتمل عدد المشاركين في هذه الختمة.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["already_holding", t.actions.errors.take.already_holding],
    ["blocked", t.actions.errors.shared.blocked],
    ["maintenance", t.actions.errors.shared.maintenance],
    ["rate_limited", t.actions.errors.shared.rate_limited],
  ])("%s shows its own kind copy", async (reason, copy) => {
    m.take.mockResolvedValue({ ok: false, reason });
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    expect(toast()).toHaveTextContent(copy);
    expect(copy.length).toBeGreaterThan(10);
  });

  it("a thrown take shows the network toast and can be retried", async () => {
    m.take.mockRejectedValueOnce(new Error("offline"));
    m.take.mockResolvedValueOnce({ ok: true });
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    expect(toast()).toHaveTextContent(t.errors.network);
    const again = screen.getByRole("button", { name: "نعم، هذا جزئي" });
    expect(again).toBeEnabled();
    await user.click(again);
    expect(m.take).toHaveBeenCalledTimes(2);
    expect(toast()).toHaveTextContent("لك الآن");
  });

  it("disables the confirm button while the take runs, so a double tap sends once", async () => {
    let finish!: (v: { ok: true }) => void;
    m.take.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    const confirm = screen.getByRole("button", { name: "نعم، هذا جزئي" });
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(m.take).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true }));
    expect(toast()).toHaveTextContent("لك الآن");
  });
});

describe("live region", () => {
  it("is mounted before any toast, polite, and stays the same node when one arrives", async () => {
    m.take.mockResolvedValue({ ok: true });
    const { user } = setup(makeView({ me: signedIn() }));
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("لك الآن");
  });
});

describe("stale state", () => {
  const lostRace = async () => {
    m.take.mockResolvedValue({ ok: false, reason: "taken" });
    const ctx = setup(makeView({ me: signedIn() }));
    await ctx.user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await ctx.user.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
    return ctx;
  };
  const later = () =>
    makeView({
      tiles: makeTiles({ 3: { state: "reading", readerName: "سارة" } }),
      me: signedIn({ suggestion: 4 }),
    });

  it("the wait for a new suggestion is bounded: a later unrelated change opens nothing", async () => {
    const { show } = await lostRace();
    act(() => void vi.advanceTimersByTime(6_000));
    show(later());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("any user action ends the wait", async () => {
    const { user, show } = await lostRace();
    await user.click(screen.getByRole("button", { name: /^الجزء ٩،/ }));
    await user.click(screen.getByRole("button", { name: "ليس الآن" }));
    show(later());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a finished attempt does not reopen again on the next change", async () => {
    const { user, show } = await lostRace();
    show(later());
    expect(screen.getByRole("dialog", { name: "الجزء ٤" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ليس الآن" }));
    show(
      makeView({
        tiles: makeTiles({ 3: { state: "reading" }, 4: { state: "reading" } }),
        me: signedIn({ suggestion: 5 }),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears the take sheet when the celebration starts, and it stays gone afterwards", async () => {
    const { user, show } = setup(makeView({ me: signedIn() }));
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    show(
      makeView({
        lastCompleted: { roundNumber: 12, participants: 7 },
        me: signedIn({ celebrateRound: 12 }),
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    show(makeView({ me: signedIn() }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the release sheet when the juz' is no longer held", async () => {
    const { user, show } = setup(
      makeView({ me: signedIn({ holding: 5, suggestion: null }) }),
    );
    await user.click(screen.getByRole("button", { name: "لا أستطيع إكماله" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    show(makeView({ me: signedIn({ holding: null, suggestion: 3 }) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("take after verification", () => {
  const signedOut = () =>
    makeView({
      me: {
        signedIn: false,
        displayName: null,
        isMember: false,
        holding: null,
        suggestion: 3,
        celebrateRound: null,
      },
    });

  async function verifyWhileSignedOut() {
    m.token = undefined;
    const ctx = setup(signedOut());
    await ctx.user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    ctx.show(undefined); // the view reloads under the new token
    await ctx.user.click(screen.getByRole("button", { name: "verified" }));
    return ctx;
  }

  it("waits for the view to load, then opens the sheet for the pending juz'", async () => {
    const { show } = await verifyWhileSignedOut();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    m.token = "new";
    show(
      makeView({
        tiles: makeTiles(),
        me: signedIn({ suggestion: 5 }),
      }),
    );
    expect(screen.getByRole("dialog", { name: "الجزء ٣" })).toBeInTheDocument();
  });

  it("does not open the sheet when the person already holds a juz'", async () => {
    const { show } = await verifyWhileSignedOut();
    m.token = "new";
    show(makeView({ me: signedIn({ holding: 8, suggestion: null }) }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("جزؤك الآن")).toBeInTheDocument();
  });

  it("does not open the sheet from the stale signed-out view", async () => {
    m.token = undefined;
    const { user } = setup(signedOut());
    await user.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    await user.click(screen.getByRole("button", { name: "verified" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("finish and undo", () => {
  const holding = () =>
    makeView({ me: signedIn({ holding: 5, suggestion: null }) });

  it("finish shows the undo toast, and undo calls undoFinish", async () => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 10_000 });
    m.undoFinish.mockResolvedValue({ ok: true });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(m.finish).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
    });
    const bar = toast();
    expect(bar).toHaveAttribute("aria-live", "polite");
    expect(bar).toHaveTextContent("تقبّل الله منك 🤍");
    await user.click(within(bar).getByRole("button", { name: "تراجع" }));
    expect(m.undoFinish).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
    });
    expect(toast()).toHaveTextContent(t.toast.undone);
    expect(screen.queryByRole("button", { name: "تراجع" })).toBeNull();
  });

  it("the undo bar runs for the time left and the button disappears at zero", async () => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 4_000 });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(screen.getByTestId("undo-bar")).toHaveStyle({
      animationDuration: "4000ms",
    });
    act(() => void vi.advanceTimersByTime(3_900));
    expect(screen.getByRole("button", { name: "تراجع" })).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole("button", { name: "تراجع" })).toBeNull();
    expect(toast()).toHaveTextContent("تقبّل الله منك 🤍");
    act(() => void vi.advanceTimersByTime(10_000));
    expect(toast()).toBeEmptyDOMElement();
  });

  it.each([
    ["ahead of this clock by a minute", NOW + 60_000],
    ["already in the past", NOW - 5],
    ["exactly now", NOW],
  ])(
    "a skewed undoUntil (%s) falls back to the full window from receipt",
    async (_label, undoUntil) => {
      m.finish.mockResolvedValue({ ok: true, undoUntil });
      const { user } = setup(holding());
      await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
      expect(screen.getByTestId("undo-bar")).toHaveStyle({
        animationDuration: "10000ms",
      });
      expect(screen.getByRole("button", { name: "تراجع" })).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(9_900));
      expect(screen.getByRole("button", { name: "تراجع" })).toBeInTheDocument();
      act(() => void vi.advanceTimersByTime(200));
      expect(screen.queryByRole("button", { name: "تراجع" })).toBeNull();
    },
  );

  it("trusts a deadline inside the window, even when it is the last millisecond", async () => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 10_000 });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(screen.getByTestId("undo-bar")).toHaveStyle({
      animationDuration: "10000ms",
    });
  });

  it("only one toast shows at a time, and the newest wins", async () => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 10_000 });
    m.undoFinish.mockResolvedValue({
      ok: false,
      reason: "window_closed",
    });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    await user.click(screen.getByRole("button", { name: "تراجع" }));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(toast().children).toHaveLength(1);
    expect(toast()).toHaveTextContent(t.actions.errors.undo.window_closed);
    expect(toast()).not.toHaveTextContent("🤍");
  });

  it.each([
    "holding_another",
    "round_completed",
    "nothing_to_undo",
    "blocked",
    "rate_limited",
    "maintenance",
  ] as const)("undo %s shows kind copy", async (reason) => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 10_000 });
    m.undoFinish.mockResolvedValue({ ok: false, reason });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    await user.click(screen.getByRole("button", { name: "تراجع" }));
    const copy =
      reason in t.actions.errors.undo
        ? t.actions.errors.undo[reason as keyof typeof t.actions.errors.undo]
        : t.actions.errors.shared[
            reason as keyof typeof t.actions.errors.shared
          ];
    expect(toast()).toHaveTextContent(copy);
  });

  it("finish failures show kind copy", async () => {
    m.finish.mockResolvedValue({ ok: false, reason: "not_holding" });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(toast()).toHaveTextContent(t.actions.errors.notHolding);
  });

  it("a thrown finish shows the network toast", async () => {
    m.finish.mockRejectedValue(new Error("offline"));
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(toast()).toHaveTextContent(t.errors.network);
    expect(
      screen.getByRole("button", { name: "أتممتُ القراءة" }),
    ).toBeEnabled();
  });

  it("clears its timers when the page unmounts", async () => {
    m.finish.mockResolvedValue({ ok: true, undoUntil: NOW + 10_000 });
    const { user, unmount } = setup(holding());
    await user.click(screen.getByRole("button", { name: "أتممتُ القراءة" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("release", () => {
  const holding = () =>
    makeView({ me: signedIn({ holding: 5, suggestion: null }) });

  it("asks for confirmation first, then releases", async () => {
    m.release.mockResolvedValue({ ok: true });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "لا أستطيع إكماله" }));
    expect(m.release).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog", {
      name: "لا بأس، جزاك الله خيراً",
    });
    expect(sheet).toHaveTextContent(
      "سنعيد الجزء ٥ ليقرأه غيرك. لن يعرف أحد أنك أعدته.",
    );
    await user.click(
      within(sheet).getByRole("button", { name: "أعِده إلى الختمة" }),
    );
    expect(m.release).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast()).toHaveTextContent("أعدناه إلى الختمة. جزاك الله خيراً");
  });

  it("keeping the juz' closes the sheet without releasing", async () => {
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "لا أستطيع إكماله" }));
    await user.click(
      screen.getByRole("button", { name: "سأكمله إن شاء الله" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.release).not.toHaveBeenCalled();
  });

  it("a failed release closes the sheet with kind copy", async () => {
    m.release.mockResolvedValue({ ok: false, reason: "not_holding" });
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "لا أستطيع إكماله" }));
    await user.click(screen.getByRole("button", { name: "أعِده إلى الختمة" }));
    expect(toast()).toHaveTextContent(t.actions.errors.notHolding);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a thrown release keeps the sheet open for a retry", async () => {
    m.release.mockRejectedValue(new Error("offline"));
    const { user } = setup(holding());
    await user.click(screen.getByRole("button", { name: "لا أستطيع إكماله" }));
    await user.click(screen.getByRole("button", { name: "أعِده إلى الختمة" }));
    expect(toast()).toHaveTextContent(t.errors.network);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "أعِده إلى الختمة" }),
    ).toBeEnabled();
  });
});

describe("celebration", () => {
  const celebrating = () =>
    makeView({
      lastCompleted: { roundNumber: 12, participants: 7 },
      me: signedIn({ celebrateRound: 12, suggestion: 1 }),
    });

  it("replaces the khatma content and shows both duas with references", () => {
    setup(celebrating());
    expect(
      screen.getByRole("heading", { level: 1, name: "ختمنا القرآن معاً" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("الحمد لله · ختمة العائلة · الختمة ١٢"),
    ).toBeInTheDocument();
    expect(screen.getByText("شارك فيها ٧ من أحبابك")).toBeInTheDocument();
    expect(screen.getByText(/رَبَّنَا تَقَبَّلْ/)).toBeInTheDocument();
    expect(screen.getByText("البقرة ١٢٧")).toBeInTheDocument();
    expect(screen.getByText("البقرة ٢٠١")).toBeInTheDocument();
    expect(screen.queryByText("الأجزاء الثلاثون")).not.toBeInTheDocument();
  });

  it("marks the round celebrated, and the khatma returns once the view flips", async () => {
    m.markCelebrated.mockResolvedValue({ ok: true });
    const { user, show } = setup(celebrating());
    await user.click(screen.getByRole("button", { name: "تابع إلى الختمة" }));
    expect(m.markCelebrated).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
    });
    show(makeView({ me: signedIn() }));
    expect(screen.getByText("الأجزاء الثلاثون")).toBeInTheDocument();
  });

  it("a failed or thrown markCelebrated shows a toast and allows a retry", async () => {
    m.markCelebrated.mockResolvedValueOnce({ ok: false });
    m.markCelebrated.mockRejectedValueOnce(new Error("offline"));
    const { user } = setup(celebrating());
    const go = () => screen.getByRole("button", { name: "تابع إلى الختمة" });
    await user.click(go());
    expect(toast()).toHaveTextContent(t.errors.generic);
    expect(go()).toBeEnabled();
    await user.click(go());
    expect(toast()).toHaveTextContent(t.errors.network);
    expect(m.markCelebrated).toHaveBeenCalledTimes(2);
  });

  it("the share link names nobody", () => {
    setup({
      ...celebrating(),
      inviterName: "أحمد",
      tiles: makeTiles({ 2: { state: "reading", readerName: "سارة" } }),
    });
    const href =
      screen
        .getByRole("link", { name: "شارك الفرحة على واتساب" })
        .getAttribute("href") ?? "";
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).not.toMatch(/سارة|أحمد|العائلة/);
    expect(text).toContain("ختمنا القرآن معاً");
  });
});
