import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { OrganizerPage } from "./OrganizerPage";

type Fn = "update" | "removeMember" | "unblock" | "handOver";

const m = vi.hoisted(() => ({
  settings: undefined as unknown,
  fns: {
    update: vi.fn(),
    removeMember: vi.fn(),
    unblock: vi.fn(),
    handOver: vi.fn(),
  },
  resetInvite: vi.fn(),
  /** When set, navigate() does nothing, so a test can stop between the action and the route change. */
  holdNavigation: false,
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => "tok",
  getSessionToken: () => "tok",
  clearSessionToken: () => {},
}));
vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => {
      const navigate = actual.useNavigate();
      return ((...args: Parameters<typeof navigate>) =>
        m.holdNavigation ? undefined : navigate(...args)) as typeof navigate;
    },
  };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => m.settings,
    useMutation: (ref: never) =>
      m.fns[getFunctionName(ref).split(":")[1] as Fn],
    useAction: () => m.resetInvite,
  };
});

const organizerView = {
  name: "ختمة العائلة",
  schedule: "weekly",
  grace: { value: 2, unit: "days" },
  suggestedGrace: { value: 2, unit: "days" },
  members: [
    { memberId: "m1", displayName: "أبو علي", isOrganizer: true },
    { memberId: "m2", displayName: "سارة", isOrganizer: false },
    { memberId: "m3", displayName: "خالد", isOrganizer: false },
  ],
  blocked: [{ memberId: "m9", displayName: "ليلى" }],
};

const visited: string[] = [];

function Where() {
  const location = useLocation();
  useEffect(() => {
    visited.push(location.pathname);
  }, [location.pathname]);
  return (
    <output data-testid="where">
      {location.pathname}|{JSON.stringify(location.state)}
    </output>
  );
}

function renderPage() {
  return render(tree());
}

function tree() {
  return (
    <MemoryRouter initialEntries={["/j/CODE/settings"]}>
      <Where />
      <Routes>
        <Route path="/j/:inviteCode" element={<p>khatma-page</p>} />
        <Route path="/j/:inviteCode/settings" element={<OrganizerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const section = (name: string) => screen.getByRole("region", { name });

describe("OrganizerPage", () => {
  beforeEach(() => {
    visited.length = 0;
    Object.values(m.fns).forEach((f) =>
      f.mockReset().mockResolvedValue({ ok: true }),
    );
    m.resetInvite.mockReset().mockResolvedValue({ inviteCode: "NEWCODE" });
    m.holdNavigation = false;
    m.settings = structuredClone(organizerView);
  });

  it("non-organizer is sent back to the khatma", () => {
    m.settings = { forbidden: true };
    renderPage();
    expect(screen.getByText("khatma-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/j\/CODE\|/);
  });

  it("shows a loading state until the settings arrive", () => {
    m.settings = undefined;
    renderPage();
    expect(screen.getByText(t.common.loading)).toBeInTheDocument();
  });

  it("member rows show names only and no reading data", () => {
    renderPage();
    const rows = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("أبو علي");
    expect(rows[0]).toHaveTextContent(t.organizer.organizerBadge);
    expect(within(rows[0]!).queryByRole("button")).toBeNull();
    expect(rows[1]).toHaveTextContent(/^سارة/);
    expect(rows[1]).not.toHaveTextContent(/[٠-٩0-9]/);
    expect(
      within(rows[1]!).getByRole("button", { name: /^اجعله المنظّم/ }),
    ).toBeVisible();
    expect(
      within(rows[1]!).getByRole("button", { name: /^إزالة/ }),
    ).toBeVisible();
  });

  it("saves the name and the schedule with their own buttons", async () => {
    const user = userEvent.setup();
    renderPage();
    const nameBox = screen.getByLabelText(t.create.nameLabel);
    await user.clear(nameBox);
    await user.type(nameBox, "  ختمة الجيران ");
    await user.click(
      within(section(t.organizer.nameHeading)).getByRole("button", {
        name: t.organizer.save,
      }),
    );
    expect(m.fns.update).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      name: "ختمة الجيران",
    });
    // The confirmation sits under the button that was tapped, not at the foot of the page.
    expect(
      await within(section(t.organizer.nameHeading)).findByRole("status"),
    ).toHaveTextContent(t.organizer.saved);
    expect(
      within(section(t.create.scheduleLegend)).getByRole("status"),
    ).toBeEmptyDOMElement();

    const scheduleSection = section(t.create.scheduleLegend);
    expect(scheduleSection).toHaveTextContent(t.organizer.scheduleNote);
    await user.click(within(scheduleSection).getByLabelText("شهرية"));
    await user.click(
      within(scheduleSection).getByRole("button", { name: t.organizer.save }),
    );
    expect(m.fns.update).toHaveBeenLastCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      schedule: "monthly",
    });
    expect(
      await within(scheduleSection).findByText(t.organizer.saved),
    ).toBeInTheDocument();
  });

  it("an emptied name is sent as null", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.clear(screen.getByLabelText(t.create.nameLabel));
    await user.click(
      within(section(t.organizer.nameHeading)).getByRole("button", {
        name: t.organizer.save,
      }),
    );
    expect(m.fns.update).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      name: null,
    });
  });

  it("save stays off until something changed", () => {
    renderPage();
    for (const name of [
      t.organizer.nameHeading,
      t.create.scheduleLegend,
      t.grace.label,
    ]) {
      expect(
        within(section(name)).getByRole("button", { name: t.organizer.save }),
      ).toBeDisabled();
    }
  });

  it("saves the grace, and shows the suggestion only when it differs", async () => {
    m.settings = {
      ...structuredClone(organizerView),
      grace: { value: 3, unit: "days" },
    };
    const user = userEvent.setup();
    renderPage();
    const graceSection = section(t.grace.label);
    expect(graceSection).toHaveTextContent(t.organizer.graceNote);
    expect(graceSection).toHaveTextContent(
      t.organizer.suggested(t.grace.amount.days(2)),
    );
    await user.click(
      within(graceSection).getByRole("button", { name: /تغيير/ }),
    );
    const amount = within(graceSection).getByLabelText(t.grace.amountLabel);
    await user.clear(amount);
    await user.type(amount, "٥");
    await user.click(
      within(graceSection).getByRole("button", { name: t.organizer.save }),
    );
    expect(m.fns.update).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      grace: { value: 5, unit: "days" },
    });
  });

  it("hides the suggestion when it equals the current grace", () => {
    renderPage();
    expect(section(t.grace.label)).not.toHaveTextContent("المقترح");
  });

  it("an out-of-range grace cannot be saved", async () => {
    const user = userEvent.setup();
    renderPage();
    const graceSection = section(t.grace.label);
    await user.click(
      within(graceSection).getByRole("button", { name: /تغيير/ }),
    );
    const amount = within(graceSection).getByLabelText(t.grace.amountLabel);
    await user.clear(amount);
    await user.type(amount, "99");
    expect(
      within(graceSection).getByRole("button", { name: t.organizer.save }),
    ).toBeDisabled();
    expect(m.fns.update).not.toHaveBeenCalled();
  });

  it("shows the network copy when saving throws", async () => {
    m.fns.update.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(t.create.nameLabel), "x");
    await user.click(
      within(section(t.organizer.nameHeading)).getByRole("button", {
        name: t.organizer.save,
      }),
    );
    expect(
      await within(section(t.organizer.nameHeading)).findByRole("alert"),
    ).toHaveTextContent(t.errors.network);
  });

  it("remove asks for confirmation first", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    )[1]!;
    await user.click(within(row).getByRole("button", { name: /^إزالة/ }));
    expect(m.fns.removeMember).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent(
      "سيعود جزؤه إلى الختمة، ولن يستطيع الانضمام مرة أخرى حتى تسمح له.",
    );
    await user.click(within(sheet).getByRole("button", { name: "إزالة" }));
    expect(m.fns.removeMember).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      memberId: "m2",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelling the removal sheet removes nobody", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    )[2]!;
    await user.click(within(row).getByRole("button", { name: /^إزالة/ }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t.organizer.cancel,
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(m.fns.removeMember).not.toHaveBeenCalled();
  });

  it("handover confirmation then returns to the khatma", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    )[1]!;
    await user.click(
      within(row).getByRole("button", { name: /^اجعله المنظّم/ }),
    );
    expect(m.fns.handOver).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "اجعله المنظّم",
      }),
    );
    expect(m.fns.handOver).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      memberId: "m2",
    });
    expect(await screen.findByText("khatma-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/j\/CODE\|/);
  });

  it("a refused handover stays here and says so", async () => {
    m.fns.handOver.mockResolvedValue({ ok: false, reason: "not_member" });
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    )[1]!;
    await user.click(
      within(row).getByRole("button", { name: /^اجعله المنظّم/ }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "اجعله المنظّم",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.errors.generic,
    );
    expect(screen.queryByText("khatma-page")).toBeNull();
  });

  it("a mid-session forbidden sends the person back to the khatma", async () => {
    m.fns.removeMember.mockRejectedValue(
      new ConvexError({ code: "forbidden" }),
    );
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.membersHeading)).getAllByRole(
      "listitem",
    )[1]!;
    await user.click(within(row).getByRole("button", { name: /^إزالة/ }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "إزالة" }),
    );
    expect(await screen.findByText("khatma-page")).toBeInTheDocument();
  });

  it("lets a blocked person back in", async () => {
    const user = userEvent.setup();
    renderPage();
    const row = within(section(t.organizer.blockedHeading)).getByRole(
      "listitem",
    );
    expect(row).toHaveTextContent("ليلى");
    await user.click(
      within(row).getByRole("button", { name: /^السماح بالعودة/ }),
    );
    expect(m.fns.unblock).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      memberId: "m9",
    });
  });

  it("hides the blocked section when nobody is blocked", () => {
    (m.settings as typeof organizerView).blocked = [];
    renderPage();
    expect(
      screen.queryByRole("region", { name: t.organizer.blockedHeading }),
    ).toBeNull();
  });

  it("reset asks first, then navigates to the new code and opens the invite sheet", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      within(section(t.organizer.resetHeading)).getByRole("button", {
        name: t.organizer.reset,
      }),
    );
    expect(m.resetInvite).not.toHaveBeenCalled();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent(
      "الروابط القديمة ستتوقف عن العمل. أرسل الرابط الجديد إلى المجموعة.",
    );
    await user.click(
      within(sheet).getByRole("button", { name: t.organizer.resetConfirm }),
    );
    expect(m.resetInvite).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
    });
    expect(await screen.findByText("khatma-page")).toBeInTheDocument();
    const where = screen.getByTestId("where");
    expect(where).toHaveTextContent(/^\/j\/NEWCODE\|/);
    expect(where).toHaveTextContent('{"openInvite":true}');
  });

  it("a refused removal shows its error inside the members section", async () => {
    m.fns.removeMember.mockResolvedValue({ ok: false, reason: "not_member" });
    const user = userEvent.setup();
    renderPage();
    const members = section(t.organizer.membersHeading);
    await user.click(
      within(within(members).getAllByRole("listitem")[1]!).getByRole("button", {
        name: /^إزالة/,
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "إزالة" }),
    );
    expect(await within(members).findByRole("alert")).toHaveTextContent(
      t.errors.generic,
    );
  });

  it("a refused unblock shows the common error inside the blocked section", async () => {
    m.fns.unblock.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    renderPage();
    const blocked = section(t.organizer.blockedHeading);
    await user.click(
      within(blocked).getByRole("button", { name: /^السماح بالعودة/ }),
    );
    expect(await within(blocked).findByRole("alert")).toHaveTextContent(
      t.errors.generic,
    );
  });

  it("the old code turning forbidden mid-reset does not bounce to the dead link", async () => {
    let finish: (value: { inviteCode: string }) => void = () => {};
    m.resetInvite.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(
      within(section(t.organizer.resetHeading)).getByRole("button", {
        name: t.organizer.reset,
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t.organizer.resetConfirm,
      }),
    );
    // The server swapped the code: the live query for the old one is now forbidden.
    m.settings = { forbidden: true };
    view.rerender(tree());
    expect(screen.queryByText("khatma-page")).toBeNull();
    expect(screen.getByTestId("where")).toHaveTextContent(
      /^\/j\/CODE\/settings\|/,
    );
    await act(async () => finish({ inviteCode: "NEWCODE" }));
    expect(await screen.findByText("khatma-page")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/j\/NEWCODE\|/);
    expect(visited).not.toContain("/j/CODE");
  });

  it("the old code turning forbidden after the reset succeeds but before the route changes does not bounce", async () => {
    m.holdNavigation = true;
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(
      within(section(t.organizer.resetHeading)).getByRole("button", {
        name: t.organizer.reset,
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t.organizer.resetConfirm,
      }),
    );
    await vi.waitFor(() => expect(m.resetInvite).toHaveBeenCalled());
    await act(async () => {});
    // The action resolved and navigate() was called, but the route is still the old one.
    m.settings = { forbidden: true };
    view.rerender(tree());
    expect(screen.queryByText("khatma-page")).toBeNull();
    expect(screen.getByTestId("where")).toHaveTextContent(
      /^\/j\/CODE\/settings\|/,
    );
    expect(visited).not.toContain("/j/CODE");
  });

  it("a failed reset gives the page back: a later forbidden state still leaves it", async () => {
    m.resetInvite.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(
      within(section(t.organizer.resetHeading)).getByRole("button", {
        name: t.organizer.reset,
      }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t.organizer.resetConfirm,
      }),
    );
    expect(
      await within(section(t.organizer.resetHeading)).findByRole("alert"),
    ).toBeInTheDocument();
    m.settings = { forbidden: true };
    view.rerender(tree());
    expect(await screen.findByText("khatma-page")).toBeInTheDocument();
  });
});
