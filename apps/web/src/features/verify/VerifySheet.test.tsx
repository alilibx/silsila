import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { clearSessionToken } from "../../lib/session";
import { VerifySheet } from "./VerifySheet";

const m = vi.hoisted(() => ({
  status: undefined as unknown,
  sessions: undefined as unknown,
  claim: vi.fn(),
  confirmPin: vi.fn(),
  reject: vi.fn(),
  signOutOthers: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      if (args === "skip") return undefined;
      return getFunctionName(ref) === "verification:status"
        ? m.status
        : m.sessions;
    },
    useAction: (ref: never) =>
      getFunctionName(ref) === "verification:claim" ? m.claim : m.confirmPin,
    useMutation: (ref: never) =>
      getFunctionName(ref) === "verification:reject"
        ? m.reject
        : m.signOutOthers,
  };
});

const START = {
  verificationId: "v1",
  secret: "sec",
  code: "AAAA-BBBB-CC",
  waNumber: "971500000000",
  message: "رمز التحقق في سلسلة: AAAA-BBBB-CC",
};
const fetchMock = vi.fn();
const open = vi.fn();
const onVerified = vi.fn();
const onClose = vi.fn();

function ui() {
  return render(
    <VerifySheet
      title={t.verify.beforeTake}
      onVerified={onVerified}
      onClose={onClose}
    />,
  );
}

async function signInStart(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(t.verify.nameLabel), "علي");
  await user.click(screen.getByRole("button", { name: t.verify.start }));
}

beforeEach(() => {
  localStorage.clear();
  clearSessionToken();
  m.status = undefined;
  m.sessions = undefined;
  for (const f of [m.claim, m.confirmPin, m.reject, m.signOutOthers])
    f.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(START)));
  open.mockReset();
  open.mockReturnValue(null);
  onVerified.mockReset();
  onClose.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("open", open);
  vi.stubEnv("VITE_CONVEX_SITE_URL", "https://x.convex.site");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("VerifySheet", () => {
  it("is an accessible dialog titled by the prop", () => {
    ui();
    const dialog = screen.getByRole("dialog", { name: t.verify.beforeTake });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("name step: a blank name shows the error and sends nothing", async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole("button", { name: t.verify.start }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.verify.errors.nameRequired,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("waiting step offers a real WhatsApp link, labelled for a first open when the popup was blocked", async () => {
    const user = userEvent.setup();
    ui();
    await signInStart(user);
    const link = await screen.findByRole("link", {
      name: t.verify.openWhatsApp,
    });
    expect(link).toHaveAttribute(
      "href",
      `https://wa.me/971500000000?text=${encodeURIComponent(START.message)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("labels the link 'open again' once the popup opened", async () => {
    open.mockReturnValue({
      location: { href: "" },
      closed: false,
      close: vi.fn(),
    });
    const user = userEvent.setup();
    ui();
    await signInStart(user);
    expect(
      await screen.findByRole("link", { name: t.verify.reopenWhatsApp }),
    ).toBeInTheDocument();
  });

  it("confirm step shows the greeting and a ltr masked number, and yes finishes", async () => {
    const user = userEvent.setup();
    m.status = { status: "matched", maskedPhone: "+971 50 ••• 1234" };
    m.claim.mockResolvedValue({ sessionToken: "tok" });
    ui();
    await signInStart(user);
    expect(
      await screen.findByText(t.verify.confirmTitle("علي")),
    ).toBeInTheDocument();
    const phone = screen.getByText("+971 50 ••• 1234");
    expect(phone).toHaveAttribute("dir", "ltr");
    await user.click(screen.getByRole("button", { name: t.verify.yes }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
  });

  it("not me rejects and offers a retry that returns to the name step", async () => {
    const user = userEvent.setup();
    m.status = { status: "matched", maskedPhone: "+971 50 ••• 1234" };
    m.reject.mockResolvedValue(null);
    ui();
    await signInStart(user);
    await user.click(
      await screen.findByRole("button", { name: t.verify.notMe }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.verify.errors.rejected,
    );
    await user.click(screen.getByRole("button", { name: t.verify.retry }));
    expect(screen.getByLabelText(t.verify.nameLabel)).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  describe("pin step", () => {
    beforeEach(() => {
      m.status = { status: "needs_pin", maskedPhone: "+971 50 ••• 1234" };
    });

    it("has a one-time-code numeric input and submits at six digits, Arabic digits included", async () => {
      const user = userEvent.setup();
      m.confirmPin.mockResolvedValue({ sessionToken: "tok", otherSessions: 0 });
      ui();
      await signInStart(user);
      expect(await screen.findByText(t.verify.pinTitle)).toBeInTheDocument();
      expect(screen.getByText("+971 50 ••• 1234")).toHaveAttribute(
        "dir",
        "ltr",
      );
      const input = screen.getByLabelText(t.verify.pinLabel);
      expect(input).toHaveAttribute("inputmode", "numeric");
      expect(input).toHaveAttribute("autocomplete", "one-time-code");
      await user.click(input);
      await user.paste("١٢٣٤٥٦");
      expect(m.confirmPin).toHaveBeenCalledWith(
        expect.objectContaining({ pin: "123456" }),
      );
      await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    });

    it("a wrong pin shows the message and clears the input", async () => {
      const user = userEvent.setup();
      m.confirmPin.mockResolvedValue({ error: "wrong_pin" });
      ui();
      await signInStart(user);
      const input = await screen.findByLabelText(t.verify.pinLabel);
      await user.type(input, "111111");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        t.verify.errors.wrong_pin,
      );
      await waitFor(() => expect(input).toHaveValue(""));
      expect(onVerified).not.toHaveBeenCalled();
    });

    it("the pin button stays disabled until six digits", async () => {
      const user = userEvent.setup();
      m.confirmPin.mockResolvedValue({ error: "wrong_pin" });
      ui();
      await signInStart(user);
      const button = await screen.findByRole("button", {
        name: t.verify.pinSubmit,
      });
      expect(button).toBeDisabled();
    });

    it("devices step lists other devices, signs them out and finishes", async () => {
      const user = userEvent.setup();
      m.confirmPin.mockResolvedValue({ sessionToken: "tok", otherSessions: 1 });
      m.signOutOthers.mockResolvedValue(null);
      m.sessions = [
        {
          sessionId: "s1",
          deviceLabel: "iPhone · Safari",
          lastUsedAt: Date.now(),
          isCurrent: false,
        },
        {
          sessionId: "s2",
          deviceLabel: "Mac · Chrome",
          lastUsedAt: Date.now(),
          isCurrent: true,
        },
      ];
      ui();
      await signInStart(user);
      await user.type(
        await screen.findByLabelText(t.verify.pinLabel),
        "123456",
      );
      expect(await screen.findByText("iPhone · Safari")).toBeInTheDocument();
      expect(screen.queryByText("Mac · Chrome")).not.toBeInTheDocument();
      expect(onVerified).not.toHaveBeenCalled();
      await user.click(
        screen.getByRole("button", { name: t.verify.signOutOthers }),
      );
      await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
      expect(m.signOutOthers).toHaveBeenCalledWith({ sessionToken: "tok" });
    });

    it("devices step 'continue' finishes without signing out", async () => {
      const user = userEvent.setup();
      m.confirmPin.mockResolvedValue({ sessionToken: "tok", otherSessions: 1 });
      m.sessions = [];
      ui();
      await signInStart(user);
      await user.type(
        await screen.findByLabelText(t.verify.pinLabel),
        "123456",
      );
      await user.click(
        await screen.findByRole("button", { name: t.verify.keep }),
      );
      expect(onVerified).toHaveBeenCalledTimes(1);
      expect(m.signOutOthers).not.toHaveBeenCalled();
    });
  });

  it("resumes a stored verification after a reload", () => {
    localStorage.setItem(
      "silsila.verify",
      JSON.stringify({
        verificationId: "v1",
        secret: "sec",
        displayName: "علي",
        expiresAt: Date.now() + 60_000,
      }),
    );
    m.status = { status: "matched", maskedPhone: "+971 50 ••• 1234" };
    ui();
    expect(screen.getByText(t.verify.confirmTitle("علي"))).toBeInTheDocument();
  });
});
