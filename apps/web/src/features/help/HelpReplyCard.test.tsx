import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { HelpReplyCard } from "./HelpReplyCard";

const m = vi.hoisted(() => ({ mine: [] as unknown[], open: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: () => m.mine }));
vi.mock("../../lib/session", () => ({ useSessionToken: () => "member" }));
vi.mock("./reporterToken", () => ({ getReporterToken: () => null }));
vi.mock("./helpUi", () => ({ useHelpUi: () => ({ openSheet: m.open }) }));

const request = (unread: boolean) => ({
  _id: "r1",
  status: "answered",
  createdAt: 0,
  lastMessageAt: 1,
  unread,
  messages: [
    {
      _id: "m2",
      from: "team",
      text: "جرّب الآن مرة أخرى",
      hasScreenshot: false,
      voiceUrl: null,
      voiceSeconds: null,
      createdAt: 1,
    },
  ],
});

beforeEach(() => {
  m.open.mockReset();
});

describe("HelpReplyCard", () => {
  it("stays hidden without an unread reply", () => {
    m.mine = [request(false)];
    const { container } = render(<HelpReplyCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the reply and opens its conversation", async () => {
    m.mine = [request(true)];
    render(<HelpReplyCard />);
    expect(screen.getByText(t.help.replyCardTitle)).toBeInTheDocument();
    expect(screen.getByText("جرّب الآن مرة أخرى")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.help.openReply }),
    );
    expect(m.open).toHaveBeenCalledWith({ requestId: "r1" });
  });
});
