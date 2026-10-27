import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTiles, makeView } from "../test/fixtures";
import { KhatmaPage } from "./KhatmaPage";
import { NotFoundPage } from "./NotFoundPage";

const useQuery = vi.fn();
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
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
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل");
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
    expect(screen.queryByText(/^دعاك/)).not.toBeInTheDocument();
  });

  it("falls back to a dated title and hides the total when none finished", () => {
    useQuery.mockReturnValue(makeView({ name: null, completedRounds: 0 }));
    renderAt("/j/CODE");
    expect(
      screen.getByRole("heading", { level: 1, name: /^ختمة .*أكتوبر/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ختمتم معاً/)).not.toBeInTheDocument();
  });

  it("shows the viewer ribbon to non-members only", () => {
    useQuery.mockReturnValue(
      makeView({
        inviterName: "أحمد",
        me: {
          signedIn: false,
          isMember: false,
          holding: null,
          suggestion: 1,
          celebrateRound: null,
        },
      }),
    );
    renderAt("/j/CODE?from=SHARE1");
    expect(screen.getByText(/^دعاك أحمد إلى هذه الختمة/)).toBeInTheDocument();
  });
});
