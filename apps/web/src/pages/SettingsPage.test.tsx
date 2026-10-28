import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { SettingsPage } from "./SettingsPage";

const m = vi.hoisted(() => ({
  me: undefined as unknown,
  list: undefined as unknown,
  token: undefined as string | undefined,
  clear: vi.fn(),
  stored: null as string | null,
  fns: {
    updateDisplayName: vi.fn(),
    signOut: vi.fn(),
    signOutOne: vi.fn(),
    signOutOthers: vi.fn(),
  },
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => m.token,
  getSessionToken: () => m.stored,
  clearSessionToken: () => m.clear(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never) =>
      getFunctionName(ref) === "sessions:me" ? m.me : m.list,
    useMutation: (ref: never) => {
      const name = getFunctionName(ref).split(":")[1] as
        "updateDisplayName" | "signOut" | "signOutOne" | "signOutOthers";
      return m.fns[name];
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
    "wirdak.verify",
    JSON.stringify({
      verificationId: "v1",
      secret: "sec",
      displayName: "أبو علي",
      expiresAt: Date.now() + 5 * 60_000,
      intent: { kind: "signin" },
    }),
  );

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/" element={<p>home-page</p>} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("SettingsPage", () => {
  beforeEach(() => {
    Object.values(m.fns).forEach((f) => f.mockReset().mockResolvedValue(null));
    m.clear.mockReset();
    m.token = "tok";
    m.stored = "tok";
    m.me = { displayName: "أبو علي", maskedPhone: "+971 •• ••• 4567" };
    localStorage.clear();
    m.list = [
      {
        sessionId: "s1",
        deviceLabel: "iPhone · Safari",
        lastUsedAt: Date.UTC(2026, 9, 27, 12),
        isCurrent: true,
      },
      {
        sessionId: "s2",
        deviceLabel: "Windows · Chrome",
        lastUsedAt: Date.UTC(2026, 9, 20, 12),
        isCurrent: false,
      },
    ];
  });

  it("shows the masked number left-to-right", () => {
    renderPage();
    const number = screen.getByText("+971 •• ••• 4567");
    expect(number).toHaveAttribute("dir", "ltr");
  });

  it("signed out: a sign-in prompt with a link home", () => {
    m.token = undefined;
    m.me = null;
    m.list = [];
    renderPage();
    expect(screen.getByText(/لا يوجد حساب مسجّل/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "الصفحة الرئيسية" }),
    ).toHaveAttribute("href", "/");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves the display name", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText("اسمك");
    expect(input).toHaveValue("أبو علي");
    await user.clear(input);
    await user.type(input, "  أم سلمى ");
    await user.click(screen.getByRole("button", { name: "احفظ الاسم" }));
    expect(m.fns.updateDisplayName).toHaveBeenCalledWith({
      sessionToken: "tok",
      displayName: "أم سلمى",
    });
    expect(await screen.findByText("تمّ حفظ الاسم")).toBeInTheDocument();
  });

  it("shows invalid_name kindly", async () => {
    m.fns.updateDisplayName.mockRejectedValue(
      new ConvexError({ code: "invalid_name" }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "احفظ الاسم" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "لم نستطع قبول هذا الاسم",
    );
  });

  it.each(["maintenance", "rate_limited"] as const)(
    "shows %s kindly, not as a network failure",
    async (code) => {
      m.fns.updateDisplayName.mockRejectedValue(new ConvexError({ code }));
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole("button", { name: "احفظ الاسم" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(t.settings.errors[code]);
      expect(alert).not.toHaveTextContent(t.errors.network);
      expect(alert).not.toHaveTextContent(t.errors.generic);
    },
  );

  it("lists devices, marking this one", () => {
    renderPage();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("iPhone · Safari");
    expect(items[0]).toHaveTextContent("هذا الجهاز");
    expect(items[0]).toHaveTextContent(/آخر استخدام: /);
    expect(items[1]).toHaveTextContent("Windows · Chrome");
    expect(items[1]).not.toHaveTextContent("هذا الجهاز");
    expect(screen.getAllByRole("button", { name: /^تسجيل خروج/ })).toHaveLength(
      2,
    );
  });

  it("signs out another device by its id", async () => {
    const user = userEvent.setup();
    renderPage();
    const other = screen.getAllByRole("listitem")[1]!;
    await user.click(within(other).getByRole("button", { name: /تسجيل خروج/ }));
    expect(m.fns.signOutOne).toHaveBeenCalledWith({
      sessionToken: "tok",
      sessionId: "s2",
    });
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("signing out this device clears the token and goes home", async () => {
    const user = userEvent.setup();
    renderPage();
    const current = screen.getAllByRole("listitem")[0]!;
    await user.click(
      within(current).getByRole("button", { name: /تسجيل خروج/ }),
    );
    expect(m.fns.signOut).toHaveBeenCalledWith({ sessionToken: "tok" });
    expect(m.fns.signOutOne).not.toHaveBeenCalled();
    expect(m.clear).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("home-page")).toBeInTheDocument();
  });

  it("settings lists devices and signs out others", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole("button", {
        name: "تسجيل الخروج من كل الأجهزة الأخرى",
      }),
    );
    expect(m.fns.signOutOthers).toHaveBeenCalledWith({ sessionToken: "tok" });
    expect(
      await screen.findByText("سجّلنا خروج الأجهزة الأخرى."),
    ).toBeInTheDocument();
  });

  it("does not clear the token when signing out this device fails", async () => {
    m.fns.signOut.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(screen.getAllByRole("listitem")[0]!).getByRole("button", {
        name: /تسجيل خروج/,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذّر الاتصال");
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("clears a stored token the server no longer knows, and shows signed out", () => {
    m.me = null;
    m.list = [];
    renderPage();
    expect(m.clear).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/لا يوجد حساب مسجّل/)).toBeInTheDocument();
  });

  it("shows the trimmed name after saving", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText("اسمك");
    await user.clear(input);
    await user.type(input, "  أم سلمى  ");
    await user.click(screen.getByRole("button", { name: "احفظ الاسم" }));
    await screen.findByText("تمّ حفظ الاسم");
    expect(input).toHaveValue("أم سلمى");
  });

  describe("signing in on a new phone", () => {
    beforeEach(() => {
      m.token = undefined;
      m.stored = null;
      m.me = null;
      m.list = [];
    });

    it("offers a secondary sign-in button that opens verification, and stays here after", async () => {
      const user = userEvent.setup();
      const view = renderPage();
      await user.click(screen.getByRole("button", { name: t.signIn.button }));
      const sheet = screen.getByRole("dialog", { name: t.signIn.title });
      expect(JSON.parse(sheet.dataset.intent ?? "null")).toEqual({
        kind: "signin",
      });
      await user.click(screen.getByRole("button", { name: "verified" }));
      view.rerender(
        <MemoryRouter initialEntries={["/settings"]}>
          <Routes>
            <Route path="/" element={<p>home-page</p>} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByRole("textbox")).toHaveValue("أبو علي");
      expect(screen.queryByText("home-page")).toBeNull();
    });

    it("reopens the sign-in sheet after the tab reloads mid-verification", () => {
      saveSignInProgress();
      renderPage();
      expect(
        screen.getByRole("dialog", { name: t.signIn.title }),
      ).toBeInTheDocument();
    });
  });
});
