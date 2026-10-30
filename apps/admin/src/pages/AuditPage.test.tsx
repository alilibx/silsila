import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { AuditPage } from "./AuditPage";

const m = vi.hoisted(() => ({
  args: [] as unknown[],
  results: [] as unknown[],
}));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    m.args.push(args);
    return { results: m.results, status: "Exhausted", loadMore: vi.fn() };
  },
  useQuery: () => [
    { adminId: "a1", phone: "+971500000001", addedAt: 0, isMe: true },
    { adminId: "a2", phone: "+971500000002", addedAt: 1, isMe: false },
  ],
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.args = [];
  m.results = [];
});

describe("AuditPage", () => {
  it("filters by one admin, and choosing an action clears it", async () => {
    render(<AuditPage />);
    await userEvent.selectOptions(screen.getByLabelText(t.audit.byAdmin), "a2");
    expect(m.args.at(-1)).toEqual({ adminToken: "tok", adminId: "a2" });

    await userEvent.selectOptions(
      screen.getByLabelText(t.audit.filter),
      "setting.set",
    );
    expect(m.args.at(-1)).toEqual({ adminToken: "tok", action: "setting.set" });
  });

  it("names an admin's work on a rota khatma, and which operation it was", () => {
    m.results = [
      {
        _id: "row1",
        adminPhone: "+971500000001",
        at: 0,
        action: "rota.adminChange",
        targetKind: "khatma",
        targetId: "k1",
        before: null,
        after: { juz: 9 },
        note: "giveJuz",
      },
      {
        _id: "row2",
        adminPhone: "+971500000001",
        at: 0,
        action: "rota.adminCreate",
        targetKind: "khatma",
        targetId: "k2",
        before: null,
        after: { phone: "+971500009000" },
        note: null,
      },
    ];
    render(<AuditPage />);
    expect(
      screen.getAllByText(t.audit.actions["rota.adminChange"]),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(t.audit.actions["rota.adminCreate"]),
    ).not.toHaveLength(0);
    expect(
      screen.getByText(new RegExp(t.audit.rotaOps.giveJuz)),
    ).toBeInTheDocument();
    expect(screen.queryByText(/giveJuz/)).not.toBeInTheDocument();
    expect(screen.getByText(/\+971500009000/)).toBeInTheDocument();
    // Both can be filtered on.
    expect(
      screen.getByRole("option", { name: t.audit.actions["rota.adminChange"] }),
    ).toBeInTheDocument();
  });

  it("names every operation an admin can do on a rota khatma, and shows an unknown note as it is", () => {
    const rotaChange = (note: string, _id: string) => ({
      _id,
      adminPhone: "+971500000001",
      at: 0,
      action: "rota.adminChange",
      targetKind: "khatma",
      targetId: "k1",
      before: null,
      after: {},
      note,
    });
    m.results = [
      rotaChange("archive", "r1"),
      rotaChange("markNotDone", "r2"),
      rotaChange("somethingNew", "r3"),
    ];
    render(<AuditPage />);
    expect(
      screen.getByText(new RegExp(t.audit.rotaOps.archive)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(t.audit.rotaOps.markNotDone)),
    ).toBeInTheDocument();
    expect(screen.getByText(/somethingNew/)).toBeInTheDocument();
    expect(screen.queryByText(/markNotDone/)).not.toBeInTheDocument();
  });

  it("leaves another action's note alone, even one named like an operation", () => {
    m.results = [
      {
        _id: "r1",
        adminPhone: "+971500000001",
        at: 0,
        action: "person.signOutAll",
        targetKind: "person",
        targetId: "p1",
        before: null,
        after: null,
        note: "archive",
      },
    ];
    render(<AuditPage />);
    expect(screen.getByText(/archive/)).toBeInTheDocument();
  });
});
