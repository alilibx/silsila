import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { ConfirmSheet } from "./ConfirmSheet";

function setup(props: { disabled?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmSheet
      title="عنوان"
      body="نص"
      confirmLabel="تأكيد"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose, user: userEvent.setup() };
}

describe("ConfirmSheet", () => {
  it("names the dialog after its title", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "عنوان" })).toBeInTheDocument();
  });

  it("passes the trimmed note to confirm", async () => {
    const { onConfirm, user } = setup();
    await user.type(screen.getByLabelText(t.ops.noteLabel), "  سبب  ");
    await user.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(onConfirm).toHaveBeenCalledWith("سبب");
  });

  it("passes undefined for an empty note", async () => {
    const { onConfirm, user } = setup();
    await user.click(screen.getByRole("button", { name: "تأكيد" }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("Enter in the note adds a line and doesn't confirm", async () => {
    const { onConfirm, user } = setup();
    const note = screen.getByLabelText(t.ops.noteLabel);
    await user.type(note, "سطر{Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(note).toHaveValue("سطر\n");
  });

  it("Escape closes without confirming", async () => {
    const { onConfirm, onClose, user } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keeps the confirm button off while disabled", () => {
    setup({ disabled: true });
    expect(screen.getByRole("button", { name: "تأكيد" })).toBeDisabled();
  });

  it("limits the note to the audit log's length", () => {
    setup();
    expect(screen.getByLabelText(t.ops.noteLabel)).toHaveAttribute(
      "maxlength",
      "500",
    );
  });
});

describe("ConfirmSheet on a short screen", () => {
  it("scrolls instead of hiding its buttons", () => {
    setup();
    expect(screen.getByRole("dialog")).toHaveClass(
      "max-h-[90svh]",
      "overflow-y-auto",
    );
  });
});
