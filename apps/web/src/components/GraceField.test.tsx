import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Grace } from "@convex/lib/grace";
import type { Schedule } from "@convex/lib/schedule";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { GraceField, formatGrace } from "./GraceField";

function Harness({
  schedule = "weekly",
  onChange = () => {},
}: {
  schedule?: Schedule;
  onChange?: (g: Grace) => void;
}) {
  const [edited, setEdited] = useState<Grace | null>(null);
  return (
    <>
      <GraceField
        value={edited}
        schedule={schedule}
        onChange={(g) => {
          setEdited(g);
          onChange(g);
        }}
      />
    </>
  );
}

describe("formatGrace", () => {
  it.each<[Grace, string]>([
    [{ value: 1, unit: "hours" }, "ساعة"],
    [{ value: 2, unit: "hours" }, "ساعتان"],
    [{ value: 6, unit: "hours" }, "٦ ساعات"],
    [{ value: 10, unit: "hours" }, "١٠ ساعات"],
    [{ value: 11, unit: "hours" }, "١١ ساعة"],
    [{ value: 720, unit: "hours" }, "٧٢٠ ساعة"],
    [{ value: 1, unit: "days" }, "يوم"],
    [{ value: 2, unit: "days" }, "يومان"],
    [{ value: 7, unit: "days" }, "٧ أيام"],
    [{ value: 30, unit: "days" }, "٣٠ يوماً"],
    [{ value: 1, unit: "minutes" }, "دقيقة"],
    [{ value: 2, unit: "minutes" }, "دقيقتان"],
    [{ value: 45, unit: "minutes" }, "٤٥ دقيقة"],
    [{ value: 5, unit: "minutes" }, "٥ دقائق"],
  ])("%j is %s", (grace, text) => {
    expect(formatGrace(grace)).toBe(text);
  });
});

describe("GraceField", () => {
  it("GraceField follows the schedule default until edited and rejects 10 minutes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <GraceField value={null} schedule="weekly" onChange={onChange} />,
    );
    expect(
      screen.getByRole("button", { name: "مهلة كل جزء: يومان · تغيير" }),
    ).toBeInTheDocument();
    rerender(<GraceField value={null} schedule="daily" onChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "مهلة كل جزء: ٦ ساعات · تغيير" }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    rerender(<Harness schedule="daily" onChange={onChange} />);
    await user.click(
      screen.getByRole("button", { name: "مهلة كل جزء: ٦ ساعات · تغيير" }),
    );
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("6");
    expect(screen.getByRole("button", { name: "ساعات" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "دقائق" }));
    await user.clear(input);
    await user.type(input, "10");
    expect(onChange).toHaveBeenLastCalledWith({ value: 10, unit: "minutes" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "المهلة بين ٣٠ دقيقة و٣٠ يوماً.",
    );

    await user.clear(input);
    await user.type(input, "45");
    expect(onChange).toHaveBeenLastCalledWith({ value: 45, unit: "minutes" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts Eastern Arabic digits and rejects anything past 30 days", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /تغيير/ }));
    await user.click(screen.getByRole("button", { name: "أيام" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "٣١");
    expect(onChange).toHaveBeenLastCalledWith({ value: 31, unit: "days" });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "٣٠");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("an empty or non-whole number is an error", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /تغيير/ }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await user.type(input, "1.5");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("done collapses it to the new value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /تغيير/ }));
    await user.click(screen.getByRole("button", { name: "أيام" }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "تمّ" }));
    expect(
      screen.getByRole("button", { name: "مهلة كل جزء: ٣ أيام · تغيير" }),
    ).toBeInTheDocument();
  });
});
