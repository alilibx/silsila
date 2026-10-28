import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { InstallStepsSheet } from "./InstallStepsSheet";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

function Host() {
  const [open, setOpen] = useState(true);
  return open ? <InstallStepsSheet onClose={() => setOpen(false)} /> : <p>x</p>;
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
});
