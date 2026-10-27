import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("[CONVEX Q(khatmas:view)] Server Error");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React reports errors caught by a boundary on the console; keep the run quiet.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders its children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("shows kind Arabic copy and a reload button instead of a blank page", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    });
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole("heading", { name: t.errorBoundary.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.errorBoundary.body)).toBeInTheDocument();
    // The technical message never reaches the screen.
    expect(screen.queryByText(/CONVEX|Server Error/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: t.errorBoundary.reload }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
