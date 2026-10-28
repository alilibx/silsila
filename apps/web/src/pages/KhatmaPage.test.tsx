import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KhatmaView } from "@convex/khatmas";
import { makeTiles, makeView } from "../test/fixtures";
import { KhatmaPage } from "./KhatmaPage";
import { NotFoundPage } from "./NotFoundPage";

const useQuery = vi.fn();
const useSessionToken = vi.fn<() => string | undefined>();
const getSessionToken = vi.fn<() => string | null>();
const clearSessionToken = vi.fn();
vi.mock("../lib/session", () => ({
  useSessionToken: () => useSessionToken(),
  getSessionToken: () => getSessionToken(),
  clearSessionToken: () => clearSessionToken(),
}));
vi.mock("../features/verify/VerifySheet", () => ({
  VerifySheet: (props: {
    title: string;
    onVerified: () => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={props.title}>
      <button onClick={props.onVerified}>verified</button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: () => vi.fn(),
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/j/:inviteCode" element={<KhatmaPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("KhatmaPage", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useSessionToken.mockReset();
    useSessionToken.mockReturnValue(undefined);
    getSessionToken.mockReset();
    getSessionToken.mockReturnValue(null);
    clearSessionToken.mockReset();
  });

  it("shows the not-found message for notFound", () => {
    useQuery.mockReturnValue({ notFound: true });
    renderAt("/j/DEAD");
    expect(
      screen.getByText(
        "هذا الرابط لم يعد يعمل. اطلب من صاحب الدعوة رابطاً جديداً.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "الصفحة الرئيسية" }),
    ).toHaveAttribute("href", "/");
  });

  it("shows a loading state while the query is pending", () => {
    useQuery.mockReturnValue(undefined);
    renderAt("/j/CODE");
    expect(screen.getByText("جارٍ التحميل")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    // The page's one live region is for toasts; loading must not add a second status.
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("passes the invite code and the from param, and omits from when absent", () => {
    useQuery.mockReturnValue(undefined);
    renderAt("/j/CODE?from=SHARE1");
    expect(useQuery.mock.calls[0]?.[1]).toMatchObject({
      inviteCode: "CODE",
      from: "SHARE1",
    });
    useQuery.mockClear();
    renderAt("/j/CODE");
    const args = useQuery.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({ inviteCode: "CODE" });
    expect("from" in args).toBe(false);
  });

  it("renders the khatma: title, chips, ring, pool, group total", () => {
    useQuery.mockReturnValue(
      makeView({
        completedRounds: 11,
        targetEndAt: Date.UTC(2026, 9, 30, 12),
        tiles: makeTiles({ 1: { state: "done" } }),
      }),
    );
    renderAt("/j/CODE");
    expect(
      screen.getByRole("heading", { level: 1, name: "ختمة العائلة" }),
    ).toBeInTheDocument();
    expect(screen.getByText("الختمة ١٢")).toBeInTheDocument();
    expect(screen.getByText("أسبوعية")).toBeInTheDocument();
    expect(screen.getByText(/^الهدف: /)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "تمّ ١ من ٣٠ جزءاً",
    );
    expect(screen.getAllByRole("button", { name: /^الجزء / })).toHaveLength(30);
    expect(
      screen.getByText("ختمتم معاً ١١ ختمة، الحمد لله"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByText(/^الهدف:/)).toBeInTheDocument();
  });

  it("falls back to a dated title and hides the total when none finished", () => {
    useQuery.mockReturnValue(makeView({ name: null, completedRounds: 0 }));
    renderAt("/j/CODE");
    expect(
      screen.getByRole("heading", { level: 1, name: /^ختمة .*أكتوبر/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ختمتم معاً/)).not.toBeInTheDocument();
  });

  it("sends sessionToken undefined when signed out and the token when signed in", () => {
    useQuery.mockReturnValue(undefined);
    renderAt("/j/CODE");
    expect(useQuery.mock.calls[0]?.[1]).toHaveProperty(
      "sessionToken",
      undefined,
    );
    useQuery.mockClear();
    useSessionToken.mockReturnValue("tok123");
    renderAt("/j/CODE");
    expect(useQuery.mock.calls[0]?.[1]).toMatchObject({
      sessionToken: "tok123",
    });
  });

  it("hides the target chip when there is no target end", () => {
    useQuery.mockReturnValue(makeView({ targetEndAt: null }));
    renderAt("/j/CODE");
    expect(screen.queryByText(/^الهدف:/)).not.toBeInTheDocument();
  });

  describe("viewer ribbon", () => {
    const viewer = (over: Partial<KhatmaView["me"]>) =>
      makeView({
        inviterName: "أحمد",
        me: {
          signedIn: false,
          displayName: null,
          isMember: false,
          notificationsOn: null,
          holding: null,
          hold: null,
          suggestion: 1,
          celebrateRound: null,
          ...over,
        },
      });

    it("signed-out viewer sees the invite and the verification tail", () => {
      useQuery.mockReturnValue(viewer({}));
      renderAt("/j/CODE?from=SHARE1");
      const ribbon = screen.getByRole("note");
      expect(ribbon).toHaveTextContent("دعاك أحمد إلى هذه الختمة.");
      expect(ribbon).toHaveTextContent("نتحقق من رقمك عبر واتساب");
    });

    it("signed-in non-member sees the invite without the verification tail", () => {
      useQuery.mockReturnValue(viewer({ signedIn: true }));
      renderAt("/j/CODE?from=SHARE1");
      const ribbon = screen.getByRole("note");
      expect(ribbon).toHaveTextContent("دعاك أحمد إلى هذه الختمة.");
      expect(ribbon).not.toHaveTextContent("واتساب");
    });

    it("anonymous invite (no inviter name) still shows a ribbon", () => {
      useQuery.mockReturnValue({ ...viewer({}), inviterName: null });
      renderAt("/j/CODE");
      const ribbon = screen.getByRole("note");
      expect(ribbon).toHaveTextContent("دُعيتَ إلى هذه الختمة.");
      expect(ribbon).not.toHaveTextContent("دعاك");
    });

    it("members get no ribbon", () => {
      useQuery.mockReturnValue(makeView({ inviterName: "أحمد" }));
      renderAt("/j/CODE?from=SHARE1");
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("take while signed out", () => {
    const signedOutView = () =>
      makeView({
        me: {
          signedIn: false,
          displayName: null,
          isMember: false,
          notificationsOn: null,
          holding: null,
          hold: null,
          suggestion: 3,
          celebrateRound: null,
        },
      });

    it("opens the verify sheet from the suggestion button", async () => {
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      expect(
        screen.getByRole("dialog", { name: "قبل أن تأخذ جزءاً" }),
      ).toBeInTheDocument();
    });

    it("opens the verify sheet from an open tile", async () => {
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      await userEvent.click(screen.getByRole("button", { name: /^الجزء ٥،/ }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("closes the sheet when verified or dismissed", async () => {
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      await userEvent.click(screen.getByRole("button", { name: "close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      await userEvent.click(screen.getByRole("button", { name: "verified" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("keeps the sheet mounted while the page reloads for the new session", async () => {
      useQuery.mockReturnValue(signedOutView());
      const { rerender } = renderAt("/j/CODE");
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      useQuery.mockReturnValue(undefined);
      rerender(
        <MemoryRouter initialEntries={["/j/CODE"]}>
          <Routes>
            <Route path="/j/:inviteCode" element={<KhatmaPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(screen.getByText("جارٍ التحميل")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("a stored token the server rejects does not count as signed in, and is cleared", async () => {
      useSessionToken.mockReturnValue("dead");
      getSessionToken.mockReturnValue("dead");
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      expect(clearSessionToken).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      expect(
        screen.getByRole("dialog", { name: "قبل أن تأخذ جزءاً" }),
      ).toBeInTheDocument();
    });

    it("does not clear a token that changed since the result, nor while loading, nor when signed out", () => {
      useSessionToken.mockReturnValue("old");
      getSessionToken.mockReturnValue("new");
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      useQuery.mockReturnValue(undefined);
      getSessionToken.mockReturnValue("old");
      renderAt("/j/CODE");
      useSessionToken.mockReturnValue(undefined);
      getSessionToken.mockReturnValue(null);
      useQuery.mockReturnValue(signedOutView());
      renderAt("/j/CODE");
      expect(clearSessionToken).not.toHaveBeenCalled();
    });

    it("opens the take sheet, not the verify sheet, while signed in", async () => {
      useSessionToken.mockReturnValue("tok");
      useQuery.mockReturnValue(
        makeView({
          me: {
            signedIn: true,
            displayName: "علي",
            isMember: true,
            notificationsOn: true,
            holding: null,
            hold: null,
            suggestion: 3,
            celebrateRound: null,
          },
        }),
      );
      renderAt("/j/CODE");
      await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
      expect(
        screen.getByRole("dialog", { name: "الجزء ٣" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: "قبل أن تأخذ جزءاً" }),
      ).not.toBeInTheDocument();
      expect(clearSessionToken).not.toHaveBeenCalled();
    });
  });
});
