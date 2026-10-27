import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { Sheet } from "./Sheet";

function ui(onClose = vi.fn()) {
  render(
    <>
      <button type="button">outside</button>
      <Sheet title="العنوان" onClose={onClose}>
        <button type="button">inside</button>
      </Sheet>
    </>,
  );
  return onClose;
}

describe("Sheet", () => {
  it("is a modal dialog labelled by its title, with focus moved inside", () => {
    ui();
    const dialog = screen.getByRole("dialog", { name: "العنوان" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes from the labelled close button", async () => {
    const onClose = ui();
    await userEvent.click(screen.getByRole("button", { name: t.sheet.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = ui();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the sheet", async () => {
    const user = userEvent.setup();
    ui();
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 5; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("leaves focus on an autofocused field inside, and still restores the opener", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Sheet title="x" onClose={() => {}}>
        <input aria-label="field" autoFocus />
      </Sheet>,
    );
    expect(screen.getByLabelText("field")).toHaveFocus();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("returns focus to the opener when it unmounts", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Sheet title="x" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
