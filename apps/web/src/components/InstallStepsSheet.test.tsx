import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionToken } from "../lib/session";
import { InstallStepsSheet } from "./InstallStepsSheet";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

const ph = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: ph.capture } }));

const wa = vi.hoisted(() => ({
  me: { whatsappNotes: false } as { whatsappNotes: boolean } | null,
  set: vi.fn(),
}));
vi.mock("convex/react", () => ({
  useQuery: () => wa.me,
  useMutation: () => wa.set,
}));

beforeEach(() => {
  localStorage.clear();
  setSessionToken("tok");
  wa.me = { whatsappNotes: false };
  wa.set.mockReset();
  ph.capture.mockReset();
});

function Host({ fromPrompt = false }: { fromPrompt?: boolean }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <InstallStepsSheet fromPrompt={fromPrompt} onClose={() => setOpen(false)} />
  ) : (
    <p>x</p>
  );
}

describe("InstallStepsSheet", () => {
  it("shows the three steps with text labels", () => {
    render(<Host />);
    expect(screen.getByText("اضغط زر المشاركة")).toBeInTheDocument();
    expect(screen.getByText(/إضافة إلى الشاشة الرئيسية/)).toBeInTheDocument();
    expect(screen.getByText(/أضف/, { selector: "li *" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أضفتُه" })).toBeInTheDocument();
    expect(screen.getByText(/الآن، ونافذة الخطوات/)).toBeInTheDocument();
  });

  it("closes from either button: added, or not now", async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("makes no hand-off token of its own (useHandoffManifest does)", () => {
    render(<Host />);
    expect(m.action).not.toHaveBeenCalled();
  });

  it("offers WhatsApp for someone who won't add it to the home screen", async () => {
    wa.set.mockResolvedValue({ ok: true });
    render(<Host />);
    await userEvent.click(
      screen.getByRole("button", { name: "أرسلها لي على واتساب" }),
    );
    expect(wa.set).toHaveBeenCalledWith({ sessionToken: "tok", on: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("records the choice when shown as the first-take prompt", async () => {
    render(<Host fromPrompt />);
    await userEvent.click(screen.getByRole("button", { name: "أضفتُه" }));
    expect(ph.capture).toHaveBeenCalledExactlyOnceWith(
      "notification_prompt_choice",
      { prompt: "install", choice: "added" },
    );
  });

  it("records WhatsApp once, without a close event after it", async () => {
    wa.set.mockResolvedValue({ ok: true });
    render(<Host fromPrompt />);
    await userEvent.click(
      screen.getByRole("button", { name: "أرسلها لي على واتساب" }),
    );
    expect(ph.capture).toHaveBeenCalledExactlyOnceWith(
      "notification_prompt_choice",
      { prompt: "install", choice: "whatsapp" },
    );
  });

  it("records nothing when opened from settings", async () => {
    wa.set.mockResolvedValue({ ok: true });
    render(<Host />);
    await userEvent.click(
      screen.getByRole("button", { name: "أرسلها لي على واتساب" }),
    );
    expect(ph.capture).not.toHaveBeenCalled();
  });
});
