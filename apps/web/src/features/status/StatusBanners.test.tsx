import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { StatusBanners } from "./StatusBanners";

const m = vi.hoisted(() => ({
  settings: undefined as unknown,
  stored: new Map<string, string>(),
  reload: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => m.settings,
}));
vi.mock("../../lib/session", () => ({
  readStored: (k: string) => m.stored.get(k) ?? null,
  writeStored: (k: string, v: string) => void m.stored.set(k, v),
}));
vi.mock("./reload", () => ({ reloadPage: () => m.reload() }));

function settings(over: Record<string, unknown> = {}) {
  return {
    announcement: null,
    maintenanceMode: false,
    maintenanceMessage: null,
    minClientVersion: null,
    ...over,
  };
}

beforeEach(() => {
  m.settings = undefined;
  m.stored.clear();
  m.reload.mockReset();
});

describe("StatusBanners", () => {
  it("renders nothing while loading or when there's nothing to say", () => {
    const { container, rerender } = render(<StatusBanners />);
    expect(container).toBeEmptyDOMElement();
    m.settings = settings();
    rerender(<StatusBanners />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows maintenance with the default copy and no close button", () => {
    m.settings = settings({ maintenanceMode: true });
    render(<StatusBanners />);
    expect(screen.getByRole("status")).toHaveTextContent(
      t.status.maintenanceDefault,
    );
    expect(
      screen.queryByRole("button", { name: t.status.dismiss }),
    ).not.toBeInTheDocument();
  });

  it("shows a custom maintenance message", () => {
    m.settings = settings({
      maintenanceMode: true,
      maintenanceMessage: "نعود بعد ساعة",
    });
    render(<StatusBanners />);
    expect(screen.getByRole("status")).toHaveTextContent("نعود بعد ساعة");
  });

  it("hides a dismissed announcement until its text changes", async () => {
    m.settings = settings({ announcement: "رمضان كريم" });
    const { rerender } = render(<StatusBanners />);
    expect(screen.getByText("رمضان كريم")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: t.status.dismiss }),
    );
    expect(screen.queryByText("رمضان كريم")).not.toBeInTheDocument();

    rerender(<StatusBanners />);
    expect(screen.queryByText("رمضان كريم")).not.toBeInTheDocument();

    m.settings = settings({ announcement: "عيد مبارك" });
    rerender(<StatusBanners />);
    expect(screen.getByText("عيد مبارك")).toBeInTheDocument();
  });

  it("reloads once for a newer required version, then offers a button", async () => {
    m.settings = settings({ minClientVersion: "999.0.0" });
    const { unmount } = render(<StatusBanners />);
    expect(m.reload).toHaveBeenCalledTimes(1);
    unmount();

    // After the reload the page still runs the old version.
    render(<StatusBanners />);
    expect(m.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t.status.updateNeeded)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.status.updateButton }),
    );
    expect(m.reload).toHaveBeenCalledTimes(2);
  });

  it("does nothing for a required version this build already meets", () => {
    m.settings = settings({ minClientVersion: "0.0.1" });
    render(<StatusBanners />);
    expect(m.reload).not.toHaveBeenCalled();
    expect(screen.queryByText(t.status.updateNeeded)).not.toBeInTheDocument();
  });
});
