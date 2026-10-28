import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { AdminsPage } from "./AdminsPage";

const m = vi.hoisted(() => ({
  list: undefined as unknown,
  add: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => m.list,
    useMutation: (ref: never) =>
      getFunctionName(ref) === "admins:add" ? m.add : m.remove,
  };
});
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.list = [
    { adminId: "a1", phone: "+971500000001", addedAt: 0, isMe: true },
    { adminId: "a2", phone: "+971500000002", addedAt: 1, isMe: false },
  ];
  m.add.mockReset().mockResolvedValue({ adminId: "a3" });
  m.remove.mockReset().mockResolvedValue(null);
});

describe("AdminsPage", () => {
  it("lists admins and marks the current one", () => {
    render(<AdminsPage />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(t.admins.you)).toBeInTheDocument();
    expect(within(rows[1]!).queryByText(t.admins.you)).not.toBeInTheDocument();
  });

  it("adds an admin by phone and shows a refused number", async () => {
    m.add.mockResolvedValueOnce({ error: "invalid_phone" });
    render(<AdminsPage />);
    await userEvent.type(
      screen.getByLabelText(t.admins.phoneLabel),
      "0501234567",
    );
    await userEvent.click(screen.getByRole("button", { name: t.admins.add }));
    expect(m.add).toHaveBeenCalledWith({
      adminToken: "tok",
      phone: "0501234567",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.admins.errors.invalid_phone,
    );
  });

  it("removes after a confirmation, and explains the last-admin rule", async () => {
    m.remove.mockResolvedValueOnce({ error: "last_admin" });
    render(<AdminsPage />);
    const second = screen.getAllByRole("listitem")[1]!;
    await userEvent.click(
      within(second).getByRole("button", { name: t.admins.remove }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.admins.confirmRemove }),
    );
    expect(m.remove).toHaveBeenCalledWith({ adminToken: "tok", adminId: "a2" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.admins.errors.last_admin,
    );
  });
});
