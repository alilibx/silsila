import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionToken, setSessionToken } from "../../lib/session";
import { HandoffGate } from "./HandoffGate";

const m = vi.hoisted(() => ({
  redeem: vi.fn(),
  standalone: true,
  iosStandalone: true,
  support: "ready" as string,
  markAsked: vi.fn(),
}));

vi.mock("../../lib/handoff", () => ({
  redeemHandoffToken: (...args: unknown[]) => m.redeem(...args),
}));
vi.mock("../../lib/push", () => ({
  isStandalone: () => m.standalone,
  pushSupport: () => m.support,
  pushAsked: () => false,
  markPushAsked: () => m.markAsked(),
  enablePush: vi.fn(),
}));

// The WhatsApp offer inside the push sheet has its own tests.
vi.mock("../../components/WhatsAppOffer", () => ({
  WhatsAppOffer: () => null,
}));

// The router's own location, which is what the app's pages read.
function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const ui = (entry = "/j/CODE?h=tok&from=wa") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <HandoffGate>
        <p>التطبيق</p>
        <Where />
      </HandoffGate>
    </MemoryRouter>,
  );

const where = () => screen.getByTestId("where").textContent;

beforeEach(() => {
  localStorage.clear();
  m.redeem.mockReset();
  m.markAsked.mockReset();
  m.standalone = true;
  m.iosStandalone = true;
  m.support = "ready";
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    get: () => m.iosStandalone,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "standalone");
});

describe("HandoffGate", () => {
  it("redeems only in the iPhone home-screen app", async () => {
    m.standalone = false;
    m.iosStandalone = false;
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
    expect(getSessionToken()).toBeNull();
    // Never leave the token in the router's location, even when it was not redeemed.
    expect(where()).toBe("/j/CODE?from=wa");
  });

  it("does not redeem in a display-mode standalone window that is not the iPhone home-screen app", async () => {
    // an installed Android PWA can capture a crafted link; only iOS sets navigator.standalone
    m.standalone = true;
    m.iosStandalone = false;
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
    expect(getSessionToken()).toBeNull();
    expect(where()).toBe("/j/CODE?from=wa");
  });

  it("trades the token for a session, strips h, and offers push", async () => {
    m.redeem.mockResolvedValue("new-session");
    ui();
    await waitFor(() => expect(getSessionToken()).toBe("new-session"));
    expect(m.redeem).toHaveBeenCalledTimes(1);
    expect(m.redeem.mock.calls[0]?.[0]).toBe("tok");
    expect(where()).toBe("/j/CODE?from=wa");
    expect(
      await screen.findByText("نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً."),
    ).toBeInTheDocument();
    expect(m.markAsked).toHaveBeenCalled();
    expect(screen.getByText("التطبيق")).toBeInTheDocument();
  });

  it("keeps an existing session and does not redeem", async () => {
    setSessionToken("mine");
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
    expect(getSessionToken()).toBe("mine");
    expect(where()).toBe("/j/CODE?from=wa");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("continues signed out when the token is invalid", async () => {
    m.redeem.mockResolvedValue(null);
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    await waitFor(() => expect(m.redeem).toHaveBeenCalledTimes(1));
    expect(getSessionToken()).toBeNull();
    expect(where()).toBe("/j/CODE?from=wa");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does nothing without h", async () => {
    ui("/j/CODE?from=wa");
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
    expect(where()).toBe("/j/CODE?from=wa");
  });

  it("drops the whole query string when h was the only parameter", async () => {
    m.redeem.mockResolvedValue("new-session");
    ui("/?h=tok");
    await waitFor(() => expect(getSessionToken()).toBe("new-session"));
    expect(where()).toBe("/");
  });

  it("only skips the push prompt when push is unsupported here", async () => {
    m.support = "unsupported";
    m.redeem.mockResolvedValue("new-session");
    ui();
    await waitFor(() => expect(getSessionToken()).toBe("new-session"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
