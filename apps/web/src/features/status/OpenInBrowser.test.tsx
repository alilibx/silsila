import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { OpenInBrowser } from "./OpenInBrowser";

const m = vi.hoisted(() => ({
  kind: null as "ios" | "android" | null,
  token: undefined as string | undefined,
}));

vi.mock("../../lib/inAppBrowser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/inAppBrowser")>()),
  inAppBrowser: () => m.kind,
}));
vi.mock("../../lib/session", () => ({ useSessionToken: () => m.token }));

beforeEach(() => {
  m.kind = null;
  m.token = undefined;
  sessionStorage.clear();
  window.history.replaceState(null, "", "/j/AbC-12_x");
});

describe("OpenInBrowser", () => {
  it("shows nothing in a real browser, or to someone signed in here", () => {
    const { rerender, container } = render(<OpenInBrowser />);
    expect(container).toBeEmptyDOMElement();
    m.kind = "android";
    m.token = "tok";
    rerender(<OpenInBrowser />);
    expect(container).toBeEmptyDOMElement();
  });

  it("on Android, hands the same page to the phone's browser", () => {
    m.kind = "android";
    render(<OpenInBrowser />);
    expect(screen.getByText(t.openInBrowser.body)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.openInBrowser.open }),
    ).toHaveAttribute(
      "href",
      `intent://${window.location.host}/j/AbC-12_x#Intent;scheme=https;end`,
    );
  });

  it("on iPhone, explains the menu and copies the link", async () => {
    m.kind = "ios";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<OpenInBrowser />);
    expect(screen.getByText(t.openInBrowser.iosHint)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.openInBrowser.copy }),
    );
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(
      await screen.findByRole("button", { name: t.openInBrowser.copied }),
    ).toBeInTheDocument();
  });

  it("can be dismissed for this visit", async () => {
    m.kind = "ios";
    const { container, unmount } = render(<OpenInBrowser />);
    await userEvent.click(
      screen.getByRole("button", { name: t.openInBrowser.dismiss }),
    );
    expect(container).toBeEmptyDOMElement();
    unmount();
    expect(render(<OpenInBrowser />).container).toBeEmptyDOMElement();
  });
});
