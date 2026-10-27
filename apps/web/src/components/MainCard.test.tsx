import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeTiles, makeView } from "../test/fixtures";
import { MainCard } from "./MainCard";

const handlers = () => ({
  onTake: vi.fn(),
  onFinish: vi.fn(),
  onRelease: vi.fn(),
});

describe("MainCard", () => {
  it("shows the suggestion", () => {
    const view = makeView({
      me: {
        signedIn: true,
        displayName: "علي",
        isMember: true,
        holding: null,
        suggestion: 19,
        celebrateRound: null,
      },
    });
    render(<MainCard view={view} {...handlers()} />);
    expect(
      screen.getByText("نقترح عليك الجزء ١٩ «وقال الذين»"),
    ).toBeInTheDocument();
  });

  it("take button passes the suggested juz", async () => {
    const h = handlers();
    const view = makeView({
      me: {
        signedIn: true,
        displayName: "علي",
        isMember: true,
        holding: null,
        suggestion: 19,
        celebrateRound: null,
      },
    });
    render(<MainCard view={view} {...h} />);
    await userEvent.click(screen.getByRole("button", { name: "خذ جزءاً" }));
    expect(h.onTake).toHaveBeenCalledWith(19);
  });

  it("shows the held juz with finish and release actions", async () => {
    const h = handlers();
    const view = makeView({
      tiles: makeTiles({ 14: { state: "reading", isMine: true } }),
      me: {
        signedIn: true,
        displayName: "علي",
        isMember: true,
        holding: 14,
        suggestion: null,
        celebrateRound: null,
      },
    });
    render(<MainCard view={view} {...h} />);
    expect(screen.getByText("١٤")).toBeInTheDocument();
    expect(screen.getByText("ربما")).toBeInTheDocument();
    expect(screen.getByText("يبدأ من سورة الحجر")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "أتممتُ القراءة" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "لا أستطيع إكماله" }),
    );
    expect(h.onFinish).toHaveBeenCalledTimes(1);
    expect(h.onRelease).toHaveBeenCalledTimes(1);
  });

  it("says all parts are taken when nothing is open", () => {
    const all = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [
        i + 1,
        { state: "reading" as const },
      ]),
    );
    render(
      <MainCard view={makeView({ tiles: makeTiles(all) })} {...handlers()} />,
    );
    expect(screen.getByText("كل الأجزاء مأخوذة الآن")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders no card for a blocked member (open tiles but no suggestion)", () => {
    const { container } = render(
      <MainCard view={makeView()} {...handlers()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
