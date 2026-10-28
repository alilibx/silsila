import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { AdminPushCard } from "./AdminPushCard";

const m = vi.hoisted(() => ({
  mine: undefined as unknown,
  support: "ready" as "ready" | "ios_install" | "unsupported",
  setNotifyHelp: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => m.mine,
    useMutation: (ref: never) =>
      getFunctionName(ref) === "adminPush:setNotifyHelp"
        ? m.setNotifyHelp
        : vi.fn(),
  };
});
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));
vi.mock("../lib/adminPush", () => ({
  adminPushSupport: () => m.support,
  currentAdminEndpoint: () => Promise.resolve("https://push.example/me"),
  enableAdminPush: (token: string) => m.enable(token),
  disableAdminPush: (token: string) => m.disable(token),
}));

beforeEach(() => {
  m.mine = { thisDevice: false, notifyHelp: true };
  m.support = "ready";
  m.setNotifyHelp.mockReset().mockResolvedValue(null);
  m.enable.mockReset().mockResolvedValue("on");
  m.disable.mockReset().mockResolvedValue(undefined);
});

describe("AdminPushCard", () => {
  it("offers to turn on push when this device isn't subscribed", async () => {
    render(<AdminPushCard />);
    await userEvent.click(
      await screen.findByRole("button", { name: t.adminPush.on }),
    );
    expect(m.enable).toHaveBeenCalledWith("tok");
  });

  it("shows the help switch when on, and turns it off", async () => {
    m.mine = { thisDevice: true, notifyHelp: true };
    render(<AdminPushCard />);
    const toggle = await screen.findByRole("switch", {
      name: t.adminPush.help,
    });
    await userEvent.click(toggle);
    expect(m.setNotifyHelp).toHaveBeenCalledWith({
      adminToken: "tok",
      on: false,
    });
    await userEvent.click(
      screen.getByRole("button", { name: t.adminPush.off }),
    );
    expect(m.disable).toHaveBeenCalledWith("tok");
  });

  it("only explains on a browser that can't push", async () => {
    m.support = "unsupported";
    render(<AdminPushCard />);
    await waitFor(() =>
      expect(screen.getByText(t.adminPush.unsupported)).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: t.adminPush.on }),
    ).not.toBeInTheDocument();
  });

  it("tells iPhone users to add the panel to the home screen", async () => {
    m.support = "ios_install";
    render(<AdminPushCard />);
    expect(await screen.findByText(t.adminPush.iosInstall)).toBeInTheDocument();
  });
});
