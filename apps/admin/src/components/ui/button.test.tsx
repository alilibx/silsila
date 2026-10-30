import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("doesn't submit a form unless asked to", () => {
    render(<Button>حفظ</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("can still be a submit button", () => {
    render(<Button type="submit">حفظ</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });
});
