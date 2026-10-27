import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Tile } from "./Tile";

describe("Tile", () => {
  it("reading tile shows the reader name and is disabled", () => {
    render(
      <Tile
        tile={{
          juz: 15,
          name: "سبحان",
          state: "reading",
          readerName: "فاطمة",
          isMine: false,
        }}
        onTake={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /الجزء ١٥/ })).toBeDisabled();
    expect(screen.getByText("فاطمة")).toBeInTheDocument();
  });

  it("reading tile for a non-member shows the state word without a name", () => {
    render(
      <Tile
        tile={{
          juz: 3,
          name: "تلك الرسل",
          state: "reading",
          readerName: null,
          isMine: false,
        }}
        onTake={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /الجزء ٣.*يُقرأ/ }),
    ).toBeDisabled();
  });

  it("my own reading tile says so", () => {
    render(
      <Tile
        tile={{
          juz: 8,
          name: "ولو أننا",
          state: "reading",
          readerName: "أنا",
          isMine: true,
        }}
        onTake={vi.fn()}
      />,
    );
    expect(screen.getByText("أنت تقرؤه")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "الجزء ٨، ولو أننا، أنت تقرؤه" }),
    ).toBeDisabled();
  });

  it("done tile never shows a name", () => {
    render(
      <Tile
        tile={{
          juz: 2,
          name: "سيقول",
          state: "done",
          readerName: "خالد",
          isMine: false,
        }}
        onTake={vi.fn()}
      />,
    );
    expect(screen.queryByText("خالد")).not.toBeInTheDocument();
    expect(screen.getByText("تمّ ✓")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /الجزء ٢.*تمّ/ })).toBeDisabled();
  });

  it("open tile calls onTake with its juz", async () => {
    const onTake = vi.fn();
    render(
      <Tile
        tile={{
          juz: 14,
          name: "ربما",
          state: "open",
          readerName: null,
          isMine: false,
        }}
        onTake={onTake}
      />,
    );
    const button = screen.getByRole("button", { name: /الجزء ١٤.*متاح/ });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onTake).toHaveBeenCalledWith(14);
  });
});
