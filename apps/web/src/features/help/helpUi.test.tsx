import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { HelpButton } from "./HelpButton";
import { HelpProvider, useHideHelpButton } from "./helpUi";
import { useHelpDeepLink } from "./useHelpDeepLink";

const m = vi.hoisted(() => ({ capture: vi.fn(), sheets: [] as unknown[] }));
vi.mock("./captureScreen", () => ({ captureScreen: () => m.capture() }));
vi.mock("./HelpSheet", () => ({
  HelpSheet: (props: { requestId: string | null; screenshot: Blob | null }) => {
    m.sheets.push(props);
    return (
      <div role="dialog" aria-label="help-sheet">
        {props.requestId ?? "new"}
      </div>
    );
  },
}));

beforeEach(() => {
  m.capture.mockReset().mockResolvedValue(new Blob(["x"]));
  m.sheets = [];
  window.history.replaceState(null, "", "/");
});

function Celebration() {
  useHideHelpButton();
  return <p>celebrating</p>;
}

function DeepLink() {
  useHelpDeepLink();
  return null;
}

describe("help button", () => {
  it("captures the screen, then opens the sheet with the picture", async () => {
    render(
      <MemoryRouter>
        <HelpProvider>
          <HelpButton />
        </HelpProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.open }));
    expect(m.capture).toHaveBeenCalled();
    expect(
      await screen.findByRole("dialog", { name: "help-sheet" }),
    ).toHaveTextContent("new");
    expect(m.sheets.at(-1)).toMatchObject({ screenshot: expect.any(Blob) });
  });

  it("hides while the celebration is on screen", () => {
    const { rerender } = render(
      <MemoryRouter>
        <HelpProvider>
          <HelpButton />
          <Celebration />
        </HelpProvider>
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: t.help.open }),
    ).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <HelpProvider>
          <HelpButton />
        </HelpProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: t.help.open }),
    ).toBeInTheDocument();
  });

  it("opens the conversation from ?help= and drops the query", async () => {
    window.history.replaceState(null, "", "/?help=r42");
    await act(async () => {
      render(
        <MemoryRouter>
          <HelpProvider>
            <DeepLink />
          </HelpProvider>
        </MemoryRouter>,
      );
    });
    expect(
      screen.getByRole("dialog", { name: "help-sheet" }),
    ).toHaveTextContent("r42");
    expect(window.location.search).toBe("");
  });
});
