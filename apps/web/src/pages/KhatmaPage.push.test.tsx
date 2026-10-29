import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KhatmaView } from "@convex/khatmas";
import { makeView } from "../test/fixtures";
import { KhatmaPage } from "./KhatmaPage";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  take: vi.fn(),
  asked: false,
  support: "ready" as string,
  markAsked: vi.fn(),
  enablePush: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: { capture: m.capture } }));

vi.mock("../lib/session", () => ({
  useSessionToken: () => "tok",
  getSessionToken: () => "tok",
  clearSessionToken: vi.fn(),
}));
vi.mock("../lib/push", () => ({
  pushAsked: () => m.asked,
  markPushAsked: () => {
    m.asked = true;
    m.markAsked();
  },
  pushSupport: () => m.support,
  enablePush: m.enablePush,
}));
vi.mock("../components/InstallStepsSheet", () => ({
  InstallStepsSheet: (props: { onClose: () => void }) => (
    <div role="dialog" aria-label="install-steps">
      <button onClick={props.onClose}>close-install</button>
    </div>
  ),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, ...rest: unknown[]) =>
      ["notes:forKhatma", "khatmas:mine"].includes(getFunctionName(ref))
        ? []
        : m.query(ref, ...rest),
    useMutation: (ref: never) =>
      getFunctionName(ref) === "pool:take" ? m.take : vi.fn(),
  };
});

const me: KhatmaView["me"] = {
  signedIn: true,
  displayName: "علي",
  isMember: true,
  notificationsOn: true,
  holding: null,
  hold: null,
  suggestion: 3,
  celebrateRound: null,
};

async function takeSuggestion() {
  await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
  await userEvent.click(screen.getByRole("button", { name: "نعم، هذا جزئي" }));
  await act(async () => {});
}

beforeEach(() => {
  m.asked = false;
  m.support = "ready";
  m.markAsked.mockReset();
  m.enablePush.mockReset();
  m.capture.mockReset();
  m.take.mockReset().mockResolvedValue({ ok: true });
  m.query.mockReturnValue(makeView({ me }));
  render(
    <MemoryRouter initialEntries={["/j/CODE"]}>
      <Routes>
        <Route path="/j/:inviteCode" element={<KhatmaPage />} />
      </Routes>
    </MemoryRouter>,
  );
});

describe("push after the first take", () => {
  it("asks once, with the reason first, and never again", async () => {
    await takeSuggestion();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent(
      "نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً.",
    );
    expect(m.markAsked).toHaveBeenCalledTimes(1);
    await userEvent.click(
      within(sheet).getByRole("button", { name: "ليس الآن" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await takeSuggestion();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.markAsked).toHaveBeenCalledTimes(1);
  });

  it("shows the install steps on an iPhone that is not installed yet", async () => {
    m.support = "ios_install";
    await takeSuggestion();
    expect(
      screen.getByRole("dialog", { name: "install-steps" }),
    ).toBeInTheDocument();
    expect(m.markAsked).toHaveBeenCalledTimes(1);
  });

  it("offers WhatsApp once where push is unsupported", async () => {
    m.support = "unsupported";
    await takeSuggestion();
    expect(
      screen.getByRole("dialog", { name: "التنبيهات على واتساب" }),
    ).toBeInTheDocument();
    expect(m.markAsked).toHaveBeenCalledTimes(1);
  });

  it("stays quiet after a failed take", async () => {
    m.support = "ready";
    m.take.mockResolvedValue({ ok: false, reason: "taken" });
    await takeSuggestion();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.markAsked).not.toHaveBeenCalled();
  });

  describe("analytics", () => {
    const events = (name: string) =>
      m.capture.mock.calls
        .filter(([event]) => event === name)
        .map(([, props]) => props as Record<string, unknown>);

    it("records which prompt was shown", async () => {
      m.support = "ios_install";
      await takeSuggestion();
      expect(events("notification_prompt_shown")).toEqual([
        { prompt: "install" },
      ]);
    });

    it("records 'not now' and the sheet's own close apart", async () => {
      await takeSuggestion();
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "ليس الآن",
        }),
      );
      expect(events("notification_prompt_choice")).toEqual([
        { prompt: "push", choice: "not_now" },
      ]);
    });

    it("records enabling push with the browser's answer", async () => {
      m.enablePush.mockResolvedValue("denied");
      await takeSuggestion();
      await userEvent.click(
        screen.getByRole("button", { name: "فعّل الإشعارات" }),
      );
      await act(async () => {});
      expect(events("notification_prompt_choice")).toEqual([
        { prompt: "push", choice: "enable", result: "denied" },
      ]);
    });

    it("records a failed push setup as an error", async () => {
      m.enablePush.mockRejectedValue(new Error("boom"));
      await takeSuggestion();
      await userEvent.click(
        screen.getByRole("button", { name: "فعّل الإشعارات" }),
      );
      await act(async () => {});
      expect(events("notification_prompt_choice")).toEqual([
        { prompt: "push", choice: "enable", result: "error" },
      ]);
    });
  });
});
