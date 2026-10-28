import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { AuditPage } from "./AuditPage";

const m = vi.hoisted(() => ({ args: [] as unknown[] }));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    m.args.push(args);
    return { results: [], status: "Exhausted", loadMore: vi.fn() };
  },
  useQuery: () => [
    { adminId: "a1", phone: "+971500000001", addedAt: 0, isMe: true },
    { adminId: "a2", phone: "+971500000002", addedAt: 1, isMe: false },
  ],
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.args = [];
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
});
