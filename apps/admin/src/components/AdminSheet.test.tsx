import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminSheet } from "./AdminSheet";

describe("AdminSheet", () => {
  it("is a dialog named after its title", () => {
    render(
      <AdminSheet title="عنوان" onClose={vi.fn()}>
        <p>محتوى</p>
      </AdminSheet>,
    );
    expect(screen.getByRole("dialog", { name: "عنوان" })).toHaveTextContent(
      "محتوى",
    );
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <AdminSheet title="عنوان" onClose={onClose}>
        <p>محتوى</p>
      </AdminSheet>,
    );
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open on a tap outside", async () => {
    const onClose = vi.fn();
    render(
      <>
        <button>خارج</button>
        <AdminSheet title="عنوان" onClose={onClose}>
          <p>محتوى</p>
        </AdminSheet>
      </>,
    );
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByText("خارج", { ignore: false }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
