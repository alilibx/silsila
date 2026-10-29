import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { HelpRequestPage } from "./HelpRequestPage";

const m = vi.hoisted(() => ({
  request: undefined as unknown,
  reply: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: () => m.request,
    useMutation: (ref: never) => {
      const name = getFunctionName(ref);
      return name === "adminHelp:reply"
        ? m.reply
        : name === "adminHelp:close"
          ? m.close
          : m.reopen;
    },
  };
});
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/help/r1"]}>
      <Routes>
        <Route path="/help/:requestId" element={<HelpRequestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  m.reply.mockReset().mockResolvedValue({ ok: true });
  m.close.mockReset().mockResolvedValue({ ok: true });
  m.reopen.mockReset().mockResolvedValue({ ok: true });
  m.request = {
    _id: "r1",
    status: "open",
    createdAt: 0,
    attachmentsDeletedAt: null,
    context: {
      path: "/j/abc",
      appVersion: "0.3.0",
      userAgent: "iPhone",
      screen: "390x844",
      timeZone: "Asia/Dubai",
    },
    person: { personId: "p1", displayName: "سارة", phone: "+971500000001" },
    khatma: {
      khatmaId: "k1",
      name: "ختمة العائلة",
      inviteCode: "abcdefghijkl",
    },
    messages: [
      {
        _id: "m1",
        from: "person",
        text: "ما أقدر أدخل",
        screenshotUrl: "https://files/shot.jpg",
        voiceUrl: "https://files/voice.mp4",
        voiceSeconds: 12,
        hadAttachment: true,
        createdAt: 0,
      },
    ],
  };
});

describe("HelpRequestPage", () => {
  it("shows the conversation, the screenshot, the voice note and the context", () => {
    renderPage();
    expect(screen.getByText("ما أقدر أدخل")).toBeInTheDocument();
    expect(screen.getByAltText(t.help.screenshot)).toHaveAttribute(
      "src",
      "https://files/shot.jpg",
    );
    expect(document.querySelector("audio")).toHaveAttribute(
      "src",
      "https://files/voice.mp4",
    );
    expect(screen.getByText("0.3.0")).toBeInTheDocument();
    expect(screen.getByText("سارة")).toBeInTheDocument();
  });

  it("sends the typed reply and shows a refusal", async () => {
    m.reply.mockResolvedValueOnce({ error: "too_long" });
    renderPage();
    await userEvent.type(
      screen.getByRole("textbox", { name: t.help.reply }),
      "جرّب الآن",
    );
    await userEvent.click(screen.getByRole("button", { name: t.help.send }));
    expect(m.reply).toHaveBeenCalledWith({
      adminToken: "tok",
      requestId: "r1",
      text: "جرّب الآن",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.help.errors.too_long,
    );
  });

  it("asks before closing", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: t.help.close }));
    expect(m.close).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: t.help.confirmClose }),
    );
    expect(m.close).toHaveBeenCalledWith({
      adminToken: "tok",
      requestId: "r1",
    });
  });

  it("says when files were deleted", () => {
    m.request = {
      ...(m.request as object),
      attachmentsDeletedAt: 1,
      messages: [
        {
          _id: "m1",
          from: "person",
          text: "قديم",
          screenshotUrl: null,
          voiceUrl: null,
          voiceSeconds: null,
          hadAttachment: true,
          createdAt: 0,
        },
      ],
    };
    renderPage();
    expect(screen.getByText(t.help.deleted)).toBeInTheDocument();
  });
});
