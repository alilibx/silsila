import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(first).toHaveTextContent(/جزؤك: ١٤ · /);
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
});
