import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTiles } from "../test/fixtures";
import { Ring } from "./Ring";

function done(n: number) {
  return Object.fromEntries(
    Array.from({ length: n }, (_, i) => [i + 1, { state: "done" as const }]),
  );
}

describe("Ring", () => {
  it("labels its progress", () => {
    render(<Ring tiles={makeTiles(done(17))} />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "تمّ ١٧ من ٣٠ جزءاً",
    );
  });

  it("shows the done count in Eastern Arabic digits at the centre", () => {
    render(<Ring tiles={makeTiles(done(17))} />);
    expect(screen.getByText("١٧")).toBeInTheDocument();
    expect(screen.getByText("من ٣٠ جزءاً تمّت")).toBeInTheDocument();
  });

  it("draws 30 beads, one per juz", () => {
    const { container } = render(<Ring tiles={makeTiles(done(3))} />);
    expect(container.querySelectorAll("circle[data-bead]")).toHaveLength(30);
  });
});
