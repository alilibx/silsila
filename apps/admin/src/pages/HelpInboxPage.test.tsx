import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { HelpInboxPage } from "./HelpInboxPage";

const m = vi.hoisted(() => ({ args: [] as unknown[], rows: [] as unknown[] }));

vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    m.args.push(args);
    return { results: m.rows, status: "Exhausted", loadMore: vi.fn() };
  },
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.args = [];
  m.rows = [
    {
      _id: "r1",
      status: "open",
      createdAt: 0,
      lastMessageAt: 0,
      firstLine: "ما أقدر أدخل",
      hasVoice: true,
      hasScreenshot: true,
      who: null,
      khatmaName: null,
    },
  ];
});

describe("HelpInboxPage", () => {
  it("lists requests, naming visitors as زائر", () => {
    render(
      <MemoryRouter>
        <HelpInboxPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("ما أقدر أدخل")).toBeInTheDocument();
    expect(screen.getByText(t.help.visitor)).toBeInTheDocument();
    expect(screen.getByText(t.help.voice)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ما أقدر أدخل/ })).toHaveAttribute(
      "href",
      "/help/r1",
    );
    expect(m.args.at(-1)).toEqual({ adminToken: "tok", status: "open" });
  });

  it("switches between open, answered and closed", async () => {
    render(
      <MemoryRouter>
        <HelpInboxPage />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("tab", { name: t.help.tabs.closed }),
    );
    expect(m.args.at(-1)).toEqual({ adminToken: "tok", status: "closed" });
  });
});
