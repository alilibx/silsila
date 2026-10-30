import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { PeoplePanel } from "./PeoplePanel";

const m = vi.hoisted(() => ({
  view: undefined as unknown,
  saved: undefined as unknown,
  fns: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("../../lib/session", () => ({
  useSessionToken: () => "tok",
  getSessionToken: () => "tok",
}));
vi.mock("./JoinRequests", () => ({ JoinRequests: () => null }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never) =>
      getFunctionName(ref) === "rota:saved" ? m.saved : m.view,
    useMutation: (ref: never) => {
      const name = getFunctionName(ref).split(":")[1] ?? "";
      m.fns[name] ??= vi.fn().mockResolvedValue({ ok: true });
      return m.fns[name];
    },
  };
});

const state = { joined: false, stopped: false, silenced: false };
const hidden = {
  id: "p1",
  name: "سعد",
  isMe: false,
  phone: null,
  ...state,
};
const shown = {
  id: "p2",
  name: "منى",
  isMe: false,
  phone: "+971501234567",
  ...state,
};

function makeView() {
  return {
    title: "ختمة العائلة",
    daysKind: "daily",
    joinLink: "https://wa.me/971500000000?text=JOIN",
    requests: [],
    target: { number: 2, date: "2026-10-31", isFirst: false },
    rows: Array.from({ length: 30 }, (_, i) => ({
      juz: i + 1,
      participant:
        i === 0
          ? { ...hidden, slots: 1 }
          : i === 1
            ? { ...shown, slots: 1 }
            : null,
    })),
    participants: [
      { ...hidden, juz: [1] },
      { ...shown, juz: [2] },
    ],
    freeJuz: Array.from({ length: 28 }, (_, i) => i + 3),
    maxSlots: 2,
  };
}

beforeEach(() => {
  m.fns = {};
  m.view = makeView();
  m.saved = [
    { id: "c1", name: "أم خالد", phone: "+971509998877", inKhatma: false },
  ];
});

describe("PeoplePanel", () => {
  it("an empty juz' also offers the saved people, and adds the one picked to that juz'", async () => {
    const user = userEvent.setup();
    render(<PeoplePanel inviteCode="CODE" archived={false} />);
    await user.click(
      screen.getByRole("button", { name: /أضف قارئاً للجزء ٥/ }),
    );
    const sheet = screen.getByRole("dialog", { name: t.rota.readerTitle(5) });
    await user.click(
      within(sheet).getByRole("button", { name: t.rota.savedFrom }),
    );
    const picker = screen.getByRole("dialog", { name: t.rota.savedTitle });
    await user.click(within(picker).getByRole("button", { name: /أم خالد/ }));
    expect(m.fns.addSaved).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      contactId: "c1",
      juz: 5,
    });
    // Added: the whole sheet is gone.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers nothing from before when no one is saved", async () => {
    const user = userEvent.setup();
    m.saved = [];
    render(<PeoplePanel inviteCode="CODE" archived={false} />);
    await user.click(
      screen.getByRole("button", { name: /أضف قارئاً للجزء ٥/ }),
    );
    expect(screen.queryByRole("button", { name: t.rota.savedFrom })).toBeNull();
  });

  it("a person whose number is hidden has no resend link; one with a number does", () => {
    render(<PeoplePanel inviteCode="CODE" archived={false} />);
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0] as HTMLElement).queryByRole("link")).toBeNull();
    expect(
      within(rows[0] as HTMLElement).getByText(t.rota.notJoinedShort),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).getByRole("link", {
        name: t.rota.notJoined,
      }),
    ).toBeInTheDocument();
  });
});
