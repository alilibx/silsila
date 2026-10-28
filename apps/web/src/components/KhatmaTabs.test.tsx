import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { KhatmaTabs, parseTab, tabParam, type KhatmaTab } from "./KhatmaTabs";

function Controlled({
  start = "mine",
  onChange,
}: {
  start?: KhatmaTab;
  onChange: (tab: KhatmaTab) => void;
}) {
  const [tab, setTab] = useState<KhatmaTab>(start);
  return (
    <KhatmaTabs
      tab={tab}
      idPrefix="k"
      onChange={(next) => {
        onChange(next);
        setTab(next);
      }}
    />
  );
}

describe("parseTab and tabParam", () => {
  it("reads the URL value, defaulting to mine", () => {
    expect(parseTab(null)).toBe("mine");
    expect(parseTab("pool")).toBe("pool");
    expect(parseTab("group")).toBe("group");
    expect(parseTab("POOL")).toBe("mine");
    expect(parseTab("mine")).toBe("mine");
  });

  it("writes no parameter for mine", () => {
    expect(tabParam("mine")).toBeNull();
    expect(tabParam("pool")).toBe("pool");
    expect(tabParam("group")).toBe("group");
  });
});

describe("KhatmaTabs", () => {
  beforeEach(() => {
    document.documentElement.dir = "rtl";
  });
  afterEach(() => {
    document.documentElement.removeAttribute("dir");
  });

  it("renders three tabs in order with the selected one marked", () => {
    render(<KhatmaTabs tab="pool" onChange={vi.fn()} idPrefix="k" />);
    expect(
      screen.getByRole("tablist", { name: t.nav.tabs.label }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual([
      t.nav.tabs.mine,
      t.nav.tabs.pool,
      t.nav.tabs.group,
    ]);
    const pool = screen.getByRole("tab", { name: t.nav.tabs.pool });
    expect(pool).toHaveAttribute("aria-selected", "true");
    expect(pool).toHaveAttribute("aria-controls", "k-panel");
    expect(pool).toHaveAttribute("id", "k-tab-pool");
    expect(pool).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: t.nav.tabs.mine })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });

  it("calls onChange on tap", async () => {
    const onChange = vi.fn();
    render(<KhatmaTabs tab="mine" onChange={onChange} idPrefix="k" />);
    await userEvent.click(screen.getByRole("tab", { name: t.nav.tabs.group }));
    expect(onChange).toHaveBeenCalledWith("group");
  });

  it("moves with arrow keys in reading direction, wrapping", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: t.nav.tabs.mine }));
    onChange.mockClear();

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("pool");
    expect(screen.getByRole("tab", { name: t.nav.tabs.pool })).toHaveFocus();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("group");
    expect(screen.getByRole("tab", { name: t.nav.tabs.group })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("mine");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("group");
  });

  it("reverses the arrows left to right", async () => {
    document.documentElement.dir = "ltr";
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: t.nav.tabs.mine }));
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("pool");
  });
});
