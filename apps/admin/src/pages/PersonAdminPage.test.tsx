import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { PersonAdminPage } from "./PersonAdminPage";

const m = vi.hoisted(() => ({
  person: undefined as unknown,
  mutation: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => m.person,
    useMutation: (ref: never) => (args: unknown) =>
      m.mutation(getFunctionName(ref), args),
  };
});
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

const person = (blocked: boolean) => ({
  displayName: "سارة",
  phone: "+971500000002",
  timeZone: "Asia/Dubai",
  verifiedAt: 0,
  lastSeenAt: 0,
  khatmas: [
    {
      khatmaId: "k1",
      name: "ختمة العائلة",
      inviteCode: "x",
      isOrganizer: true,
      status: "active",
    },
  ],
  sessions: [{ deviceLabel: "iPhone · Safari", lastUsedAt: 0 }],
  helpRequests: [],
  blocked,
});

beforeEach(() => {
  m.person = person(false);
  m.mutation.mockReset().mockResolvedValue({ ok: true, ended: 1 });
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/people/p2"]}>
      <Routes>
        <Route path="/people/:personId" element={<PersonAdminPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PersonAdminPage", () => {
  it("signs out everywhere after a confirmation", async () => {
    renderPage();
    expect(screen.getByText(t.lookup.organizerBadge)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.ops.signOutAll }),
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: t.ops.signOutAll }).at(-1)!,
    );
    expect(m.mutation).toHaveBeenCalledWith("adminOps:signOutEverywhere", {
      adminToken: "tok",
      personId: "p2",
    });
  });

  it("offers unblock for a blocked number", () => {
    m.person = person(true);
    renderPage();
    expect(
      screen.getByRole("button", { name: t.ops.unblock }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t.ops.block }),
    ).not.toBeInTheDocument();
  });
});
