import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { HomePage } from "./HomePage";

const m = vi.hoisted(() => ({
  me: undefined as unknown,
  mine: undefined as unknown,
  token: undefined as string | undefined,
  stored: null as string | null,
  clear: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => m.token,
  getSessionToken: () => m.stored,
  clearSessionToken: () => m.clear(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never) => {
      const name = getFunctionName(ref);
      return name === "sessions:me" ? m.me : m.mine;
    },
  };
});

vi.mock("../features/verify/VerifySheet", () => ({
  VerifySheet: (props: {
    title: string;
    intent?: unknown;
    onVerified: () => void;
    onClose: () => void;
  }) => (
    <div
      role="dialog"
      aria-label={props.title}
      data-intent={JSON.stringify(props.intent)}
    >
      <button
        onClick={() => {
          m.token = "fresh";
          m.stored = "fresh";
          m.me = { displayName: "أبو علي", maskedPhone: "+971 50 ••• 4567" };
          props.onVerified();
        }}
      >
        verified
      </button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));

const saveSignInProgress = () =>
  localStorage.setItem(
    "silsila.verify",
    JSON.stringify({
      verificationId: "v1",
      secret: "sec",
      displayName: "أبو علي",
      expiresAt: Date.now() + 5 * 60_000,
      intent: { kind: "signin" },
    }),
  );

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

const card = (over: object = {}) => ({
  inviteCode: "AAA",
  name: "ختمة العائلة",
  createdAt: Date.UTC(2026, 9, 20, 12),
  schedule: "weekly",
  done: 12,
  holding: null,
  ...over,
});

describe("HomePage", () => {
  beforeEach(() => {
    m.token = "tok";
    m.stored = "tok";
    m.clear.mockReset();
    m.me = { displayName: "أبو علي", maskedPhone: "x" };
    m.mine = [];
    localStorage.clear();
  });

  it("is not blank while loading", () => {
    m.me = undefined;
    m.mine = undefined;
    renderHome();
    expect(screen.getByText("جارٍ التحميل")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
  });

  it("greets the person and shows a card per khatma", () => {
    m.mine = [
      card({ holding: 14 }),
      card({ inviteCode: "BBB", name: null, done: 0, schedule: "none" }),
    ];
    renderHome();
    expect(screen.getByText("السلام عليكم، أبو علي")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /ختمة/ });
    const first = links.find((l) => l.getAttribute("href") === "/j/AAA")!;
    expect(first).toHaveTextContent("ختمة العائلة");
    expect(first).toHaveTextContent("١٢ من ٣٠ تمّت");
    expect(first).toHaveTextContent("أسبوعية");
    expect(first).toHaveTextContent("جزؤك: الجزء ١٤ «ربما»");
    expect(first).not.toHaveTextContent("·");
    const bar = within(first).getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "12");
    expect(bar).toHaveAttribute("aria-valuemax", "30");
    expect(bar).toHaveAccessibleName("تمّ ١٢ من ٣٠ جزءاً");
    const second = links.find((l) => l.getAttribute("href") === "/j/BBB")!;
    expect(second).not.toHaveTextContent("جزؤك");
    expect(second).toHaveTextContent(/^ختمة .*أكتوبر/);
  });

  it("links to create and settings", () => {
    m.mine = [card()];
    renderHome();
    expect(
      screen.getByRole("link", { name: "＋ ابدأ ختمة جديدة" }),
    ).toHaveAttribute("href", "/new");
    expect(screen.getByRole("link", { name: "إعداداتي" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("signed in with no khatmas: a kind empty state plus the create button", () => {
    renderHome();
    expect(screen.getByText(/لا توجد ختمات بعد/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ابدأ ختمة جديدة" }),
    ).toHaveAttribute("href", "/new");
  });

  it("signed out: a short explanation and the create button, no settings", () => {
    m.token = undefined;
    m.me = null;
    m.mine = [];
    renderHome();
    expect(screen.getByText(/سلسلة تجمع أحبابك/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ابدأ ختمة جديدة" }),
    ).toHaveAttribute("href", "/new");
    expect(screen.queryByRole("link", { name: "إعداداتي" })).toBeNull();
    expect(screen.queryByText(/السلام عليكم، /)).toBeNull();
  });

  it("clears a stored token the server no longer knows, and shows signed out", () => {
    m.me = null;
    renderHome();
    expect(m.clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/سلسلة تجمع أحبابك/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "إعداداتي" })).toBeNull();
  });

  it("does not clear a token that was replaced meanwhile", () => {
    m.me = null;
    m.stored = "newer";
    renderHome();
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("does not clear anything while loading or when signed in", () => {
    m.me = undefined;
    m.mine = undefined;
    renderHome();
    expect(m.clear).not.toHaveBeenCalled();
  });

  describe("signing in on a new phone", () => {
    beforeEach(() => {
      m.token = undefined;
      m.stored = null;
      m.me = null;
      m.mine = [];
    });

    it("offers a secondary sign-in button that opens verification, and stays here after", async () => {
      const user = userEvent.setup();
      const view = renderHome();
      expect(screen.queryByRole("dialog")).toBeNull();
      await user.click(screen.getByRole("button", { name: t.signIn.button }));
      const sheet = screen.getByRole("dialog", { name: t.signIn.title });
      expect(JSON.parse(sheet.dataset.intent ?? "null")).toEqual({
        kind: "signin",
      });
      m.mine = [card()];
      await user.click(screen.getByRole("button", { name: "verified" }));
      view.rerender(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByText("السلام عليكم، أبو علي")).toBeInTheDocument();
      expect(screen.getByText("ختمة العائلة")).toBeInTheDocument();
    });

    it("keeps the sheet open while the page reloads for the new session", async () => {
      const user = userEvent.setup();
      const view = renderHome();
      await user.click(screen.getByRole("button", { name: t.signIn.button }));
      m.token = "fresh";
      m.me = undefined;
      m.mine = undefined;
      view.rerender(
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>,
      );
      expect(
        screen.getByRole("dialog", { name: t.signIn.title }),
      ).toBeInTheDocument();
    });

    it("reopens the sign-in sheet after the tab reloads mid-verification", () => {
      saveSignInProgress();
      renderHome();
      expect(
        screen.getByRole("dialog", { name: t.signIn.title }),
      ).toBeInTheDocument();
    });

    it("is not offered when signed in", () => {
      m.token = "tok";
      m.me = { displayName: "أبو علي", maskedPhone: "x" };
      renderHome();
      expect(screen.queryByRole("button", { name: t.signIn.button })).toBeNull();
    });
  });
});
