import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionToken } from "../lib/session";
import { PushPromptSheet } from "./PushPromptSheet";

const m = vi.hoisted(() => ({ enable: vi.fn() }));
vi.mock("../lib/push", () => ({
  enablePush: (...args: unknown[]) => m.enable(...args),
}));

const wa = vi.hoisted(() => ({
  me: { whatsappNotes: false } as { whatsappNotes: boolean } | null,
  set: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => wa.me,
  useMutation: () => wa.set,
}));

const onClose = vi.fn();
const ui = () => render(<PushPromptSheet onClose={onClose} />);

beforeEach(() => {
  localStorage.clear();
  setSessionToken("tok");
  m.enable.mockReset();
  onClose.mockReset();
  wa.me = { whatsappNotes: false };
  wa.set.mockReset();
});

describe("PushPromptSheet", () => {
  it("explains why, then enables push for this session and closes", async () => {
    m.enable.mockResolvedValue("granted");
    ui();
    expect(
      screen.getByText("نرسل لك تذكيراً لطيفاً، ونخبرك حين نختم معاً."),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "فعّل الإشعارات" }),
    );
    expect(m.enable).toHaveBeenCalledWith("tok");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when permission is denied", async () => {
    m.enable.mockResolvedValue("denied");
    ui();
    await userEvent.click(
      screen.getByRole("button", { name: "فعّل الإشعارات" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'not now' closes without asking the browser", async () => {
    ui();
    await userEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(m.enable).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers WhatsApp instead, turning it on and closing", async () => {
    wa.set.mockResolvedValue({ ok: true });
    ui();
    await userEvent.click(
      screen.getByRole("button", { name: "أرسلها لي على واتساب" }),
    );
    expect(wa.set).toHaveBeenCalledWith({ sessionToken: "tok", on: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("doesn't offer WhatsApp to someone who has it on", () => {
    wa.me = { whatsappNotes: true };
    ui();
    expect(
      screen.queryByRole("button", { name: "أرسلها لي على واتساب" }),
    ).not.toBeInTheDocument();
  });
});
