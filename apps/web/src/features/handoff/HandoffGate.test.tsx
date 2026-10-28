import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionToken, setSessionToken } from "../../lib/session";
import { HandoffGate } from "./HandoffGate";

const m = vi.hoisted(() => ({
  redeem: vi.fn(),
  standalone: true,
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

const ui = () =>
  render(
    <HandoffGate>
      <p>التطبيق</p>
    </HandoffGate>,
  );

beforeEach(() => {
  localStorage.clear();
  m.redeem.mockReset();
  m.markAsked.mockReset();
  m.standalone = true;
  m.support = "ready";
  window.history.replaceState(null, "", "/j/CODE?h=tok&from=wa");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("HandoffGate", () => {
  it("redeems only in standalone mode", async () => {
    m.standalone = false;
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
    expect(getSessionToken()).toBeNull();
    // Never leave the token in the address bar, even when it was not redeemed.
    expect(window.location.search).toBe("?from=wa");
  });

  it("trades the token for a session, strips h, and offers push", async () => {
    m.redeem.mockResolvedValue("new-session");
    ui();
    await waitFor(() => expect(getSessionToken()).toBe("new-session"));
    expect(m.redeem).toHaveBeenCalledTimes(1);
    expect(m.redeem.mock.calls[0]?.[0]).toBe("tok");
    expect(window.location.pathname + window.location.search).toBe(
      "/j/CODE?from=wa",
    );
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
    expect(window.location.search).toBe("?from=wa");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("continues signed out when the token is invalid", async () => {
    m.redeem.mockResolvedValue(null);
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    await waitFor(() => expect(m.redeem).toHaveBeenCalledTimes(1));
    expect(getSessionToken()).toBeNull();
    expect(window.location.search).toBe("?from=wa");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does nothing without h", async () => {
    window.history.replaceState(null, "", "/");
    ui();
    expect(await screen.findByText("التطبيق")).toBeInTheDocument();
    expect(m.redeem).not.toHaveBeenCalled();
  });

  it("only skips the push prompt when push is unsupported here", async () => {
    m.support = "unsupported";
    m.redeem.mockResolvedValue("new-session");
    ui();
    await waitFor(() => expect(getSessionToken()).toBe("new-session"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
