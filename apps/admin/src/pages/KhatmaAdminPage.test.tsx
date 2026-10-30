import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { KhatmaAdminPage } from "./KhatmaAdminPage";

const m = vi.hoisted(() => ({
  reset: vi.fn(),
  handOver: vi.fn(),
  rota: null as unknown,
}));
vi.mock("convex/react", () => ({
  useQuery: () => ({
    kind: m.rota ? "rota" : "pool",
    rota: m.rota,
    name: "ختمة العائلة",
    inviteCode: "familyKhatma",
    schedule: "weekly",
    grace: { value: 2, unit: "days" },
    createdAt: 0,
    completedRounds: 2,
    organizer: { personId: "p1", displayName: "علي" },
    members: [
      {
        memberId: "m1",
        personId: "p1",
        displayName: "علي",
        joinedAt: 0,
        status: "active",
      },
      {
        memberId: "m2",
        personId: "p2",
        displayName: "سارة",
        joinedAt: 1,
        status: "active",
      },
    ],
    round: { number: 3, startedAt: 0, free: 20, taken: 4, finished: 6 },
    openHelpRequests: 1,
  }),
  useAction: () => m.reset,
  useMutation: () => m.handOver,
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.rota = null;
  m.reset.mockReset().mockResolvedValue({ inviteCode: "newCode00001" });
  m.handOver.mockReset().mockResolvedValue({ ok: true });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/khatmas/k1"]}>
      <Routes>
        <Route path="/khatmas/:khatmaId" element={<KhatmaAdminPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("KhatmaAdminPage", () => {
  it("shows the pool as three numbers, with no names next to ajza'", () => {
    renderPage();
    expect(screen.getByText("٢٠")).toBeInTheDocument();
    expect(screen.getByText("٤")).toBeInTheDocument();
    expect(screen.getByText("٦")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "سارة" })).toHaveAttribute(
      "href",
      "/people/p2",
    );
  });

  it("resets the invite link after a confirmation, with the note", async () => {
    renderPage();
    await userEvent.click(
      screen.getByRole("button", { name: t.ops.resetInvite }),
    );
    expect(m.reset).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(t.ops.noteLabel), "leaked");
    await userEvent.click(
      screen.getAllByRole("button", { name: t.ops.resetInvite }).at(-1)!,
    );
    expect(m.reset).toHaveBeenCalledWith({
      adminToken: "tok",
      khatmaId: "k1",
      note: "leaked",
    });
  });

  it("shows nothing about rotation for a pool khatma", () => {
    renderPage();
    expect(screen.queryByText(t.lookup.kindRota)).not.toBeInTheDocument();
    expect(screen.queryByText(/اليوم$/)).not.toBeInTheDocument();
  });

  it("shows a rota khatma's days, number, cycle and the day's progress", () => {
    m.rota = {
      days: { kind: "weekly", weekdays: [1, 4], everyWeeks: 1 },
      firstDate: "2026-10-01",
      endDate: null,
      pausedAt: null,
      archivedAt: null,
      number: 12,
      cycle: 1,
      dayOpen: true,
      doneToday: 27,
      total: 30,
    };
    renderPage();
    expect(screen.getByText(t.lookup.kindRota)).toBeInTheDocument();
    expect(screen.getByText("كل أسبوع: الاثنين، الخميس")).toBeInTheDocument();
    expect(screen.getByText("الختمة ١٢ · الدورة ١")).toBeInTheDocument();
    expect(screen.getByText("٢٧ / ٣٠ اليوم")).toBeInTheDocument();
    expect(screen.queryByText(t.lookup.rotaPaused)).not.toBeInTheDocument();
  });

  it("says when a rota khatma is paused or archived", () => {
    const rota = {
      days: { kind: "daily" },
      firstDate: "2026-10-01",
      endDate: "2026-12-01",
      number: null,
      cycle: null,
      dayOpen: false,
      doneToday: 0,
      total: 30,
    };
    m.rota = { ...rota, pausedAt: 5, archivedAt: null };
    const { unmount } = renderPage();
    expect(screen.getByText(t.lookup.rotaPaused)).toBeInTheDocument();
    expect(screen.getByText(t.lookup.rotaNoDay)).toBeInTheDocument();
    unmount();
    m.rota = { ...rota, pausedAt: null, archivedAt: 9 };
    renderPage();
    expect(screen.getByText(t.lookup.rotaArchived)).toBeInTheDocument();
  });
});
