import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { RETRY_DELAYS_MS, RetryBoundary } from "./RetryBoundary";

const renders = { count: 0 };

/**
 * Throws until the (fake) clock reaches `until`, the way a query fails while the backend is
 * slow. By time rather than by count: React renders a failing component more than once.
 */
function Flaky({ until }: { until: number }) {
  renders.count += 1;
  if (Date.now() < until) {
    throw new Error("[CONVEX Q(khatmas:view)] Function execution timed out");
  }
  return <p>loaded</p>;
}

/** Moves the fake clock on and lets React re-render. */
async function wait(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const total = RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);

describe("RetryBoundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    renders.count = 0;
    // React reports errors caught by a boundary on the console; keep the run quiet.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders its children when nothing throws", () => {
    render(
      <RetryBoundary resetKey="/">
        <p>loaded</p>
      </RetryBoundary>,
    );
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("keeps the rest of the screen, says it is trying again, and mounts the page again", async () => {
    render(
      <>
        <nav>bar</nav>
        <RetryBoundary resetKey="/j/abc">
          <Flaky until={Date.now() + 1} />
        </RetryBoundary>
      </>,
    );
    expect(
      screen.getByRole("heading", { name: t.retry.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(t.retry.retrying)).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
    // The technical message never reaches the screen.
    expect(screen.queryByText(/CONVEX|timed out/)).toBeNull();

    await wait(RETRY_DELAYS_MS[0]);
    expect(screen.getByText("loaded")).toBeInTheDocument();
    expect(screen.queryByText(t.retry.title)).toBeNull();
  });

  it("backs off, then offers a button once the automatic tries run out", async () => {
    render(
      <RetryBoundary resetKey="/j/abc">
        <Flaky until={Date.now() + total + 1} />
      </RetryBoundary>,
    );
    for (const delay of RETRY_DELAYS_MS) {
      expect(screen.getByText(t.retry.retrying)).toBeInTheDocument();
      // Not yet: each try waits its full delay.
      const before = renders.count;
      await wait(delay - 1);
      expect(renders.count).toBe(before);
      await wait(1);
      expect(renders.count).toBeGreaterThan(before);
    }
    expect(screen.queryByText(t.retry.retrying)).toBeNull();
    expect(screen.getByText(t.retry.failed)).toBeInTheDocument();
    // No more automatic tries.
    const settled = renders.count;
    await wait(60_000);
    expect(renders.count).toBe(settled);

    // A way out that doesn't depend on the retry working.
    expect(screen.getByRole("link", { name: t.common.home })).toHaveAttribute(
      "href",
      "/",
    );
    // The button mounts the page again at once.
    fireEvent.click(screen.getByRole("button", { name: t.retry.tryAgain }));
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("mounts the new page at once when the address changes", () => {
    const { rerender } = render(
      <RetryBoundary resetKey="/j/abc">
        <Flaky until={Date.now() + 60_000} />
      </RetryBoundary>,
    );
    expect(screen.getByText(t.retry.retrying)).toBeInTheDocument();
    rerender(
      <RetryBoundary resetKey="/settings">
        <Flaky until={0} />
      </RetryBoundary>,
    );
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("starts the tries over after the page has stayed up for a while", async () => {
    const view = render(
      <RetryBoundary resetKey="/j/abc">
        <Flaky until={Date.now() + 1} />
      </RetryBoundary>,
    );
    await wait(RETRY_DELAYS_MS[0]);
    expect(screen.getByText("loaded")).toBeInTheDocument();

    // Much later the page fails again: the first, shortest delay applies again.
    await wait(5 * 60_000);
    view.rerender(
      <RetryBoundary resetKey="/j/abc">
        <Flaky until={Date.now() + 1} key="again" />
      </RetryBoundary>,
    );
    expect(screen.getByText(t.retry.retrying)).toBeInTheDocument();
    await wait(RETRY_DELAYS_MS[0]);
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });

  it("reports an incident once, not once per automatic try", async () => {
    const report = vi.spyOn(console, "error");
    render(
      <RetryBoundary resetKey="/j/abc">
        <Flaky until={Date.now() + total + 1} />
      </RetryBoundary>,
    );
    for (const delay of RETRY_DELAYS_MS) await wait(delay);
    expect(screen.getByText(t.retry.failed)).toBeInTheDocument();
    // reportRenderError writes the error and its component stack to the console once.
    const reported = report.mock.calls.filter(
      ([error]) => error instanceof Error && /timed out/.test(error.message),
    );
    expect(reported).toHaveLength(1);
  });

  it("shows nothing while retrying when it is quiet", async () => {
    const { container } = render(
      <RetryBoundary resetKey="/" quiet>
        <Flaky until={Date.now() + 1} />
      </RetryBoundary>,
    );
    expect(container).toBeEmptyDOMElement();
    await wait(RETRY_DELAYS_MS[0]);
    expect(screen.getByText("loaded")).toBeInTheDocument();
  });
});
