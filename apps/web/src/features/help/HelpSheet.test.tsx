import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { HelpSheet } from "./HelpSheet";

const m = vi.hoisted(() => ({
  mine: [] as unknown[],
  markSeen: vi.fn(),
  sendHelp: vi.fn(),
  voice: {
    supported: true,
    state: "idle" as string,
    seconds: 0,
    blob: null as Blob | null,
    start: vi.fn(),
    stop: vi.fn(),
    discard: vi.fn(),
  },
}));

vi.mock("convex/react", () => ({
  useQuery: () => m.mine,
  useMutation: () => m.markSeen,
}));
vi.mock("../../lib/session", () => ({ useSessionToken: () => "member" }));
vi.mock("./reporterToken", () => ({ useReporterToken: () => null }));
vi.mock("./sendHelp", () => ({
  sendHelp: (args: unknown) => m.sendHelp(args),
  helpContext: () => ({
    path: "/",
    appVersion: "0.3.0",
    userAgent: "x",
    screen: "1x1",
    timeZone: "Asia/Dubai",
  }),
}));
vi.mock("./useVoiceRecorder", () => ({ useVoiceRecorder: () => m.voice }));

const shot = new Blob([new Uint8Array(10)], { type: "image/jpeg" });

beforeEach(() => {
  m.mine = [];
  m.markSeen.mockReset().mockResolvedValue(null);
  m.sendHelp.mockReset().mockResolvedValue({ requestId: "r1" });
  m.voice = { ...m.voice, supported: true, state: "idle", blob: null };
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:x",
      revokeObjectURL: () => undefined,
    }),
  );
});

function renderSheet(props: Partial<Parameters<typeof HelpSheet>[0]> = {}) {
  return render(
    <HelpSheet
      screenshot={shot}
      requestId={null}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("HelpSheet", () => {
  it("won't send a screenshot alone", async () => {
    renderSheet();
    const send = screen.getByRole("button", { name: t.help.send });
    expect(send).toBeDisabled();
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.message }),
      "ما أقدر أدخل",
    );
    expect(send).toBeEnabled();
  });

  it("sends without the screenshot once it's removed", async () => {
    renderSheet();
    await userEvent.click(
      screen.getByRole("button", { name: t.help.removeScreenshot }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.message }),
      "مشكلة",
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.send }));
    expect(m.sendHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "مشكلة",
        screenshot: null,
        sessionToken: "member",
      }),
    );
    expect(await screen.findByText(t.help.sentTitle)).toBeInTheDocument();
  });

  it("sends the screenshot by default, with the context", async () => {
    renderSheet();
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.message }),
      "مشكلة",
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.send }));
    expect(m.sendHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshot: shot,
        context: expect.objectContaining({ appVersion: "0.3.0" }),
      }),
    );
  });

  it("hides the voice button without a usable microphone", () => {
    m.voice = { ...m.voice, supported: false };
    const { unmount } = renderSheet();
    expect(
      screen.queryByRole("button", { name: t.help.record }),
    ).not.toBeInTheDocument();
    unmount();
    m.voice = { ...m.voice, supported: true, state: "denied" };
    renderSheet();
    expect(
      screen.queryByRole("button", { name: t.help.record }),
    ).not.toBeInTheDocument();
  });

  it("shows the server's reason when sending fails", async () => {
    m.sendHelp.mockResolvedValue({ error: "rate_limited" });
    renderSheet();
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.message }),
      "x",
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.send }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.help.errors.rate_limited,
    );
  });

  it("opens a conversation, marks it seen, and replies without a screenshot", async () => {
    m.mine = [
      {
        _id: "r1",
        status: "answered",
        createdAt: 0,
        lastMessageAt: 1,
        unread: true,
        messages: [
          {
            _id: "m1",
            from: "person",
            text: "مشكلة",
            hasScreenshot: true,
            voiceUrl: null,
            voiceSeconds: null,
            createdAt: 0,
          },
          {
            _id: "m2",
            from: "team",
            text: "جرّب الآن",
            hasScreenshot: false,
            voiceUrl: null,
            voiceSeconds: null,
            createdAt: 1,
          },
        ],
      },
    ];
    renderSheet({ requestId: "r1" });
    expect(screen.getByText("جرّب الآن")).toBeInTheDocument();
    expect(screen.getByText(t.help.team)).toBeInTheDocument();
    expect(m.markSeen).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "r1" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.reply }),
      "ما زالت",
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.send }));
    expect(m.sendHelp).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "r1",
        text: "ما زالت",
        screenshot: null,
      }),
    );
  });
});
