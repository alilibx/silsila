import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { SignInPage } from "./SignInPage";

const m = vi.hoisted(() => ({
  status: undefined as unknown,
  statusArgs: undefined as unknown,
  confirmPin: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      if (getFunctionName(ref) === "verification:status") {
        m.statusArgs = args;
        return args === "skip" ? undefined : m.status;
      }
      return undefined;
    },
    useAction: () => m.confirmPin,
  };
});
vi.mock("../lib/adminSession", () => ({
  setAdminToken: (token: string) => m.setToken(token),
}));
vi.mock("@web/lib/env", () => ({
  convexSiteUrl: () => "https://site.example",
}));

const started = {
  verificationId: "v1",
  secret: "s1",
  code: "ABCD-EFGH-23",
  waNumber: "971500000000",
  message: "رمز التحقق في وِردك: ABCD-EFGH-23",
};

let opened: { location: { href: string }; close: () => void; opener: unknown };

beforeEach(() => {
  m.status = undefined;
  m.statusArgs = undefined;
  m.confirmPin.mockReset();
  m.setToken.mockReset();
  opened = { location: { href: "" }, close: vi.fn(), opener: {} };
  vi.stubGlobal(
    "open",
    vi.fn(() => opened),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(started), { status: 200 })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function startSignIn() {
  const view = render(<SignInPage />);
  await userEvent.click(screen.getByRole("button", { name: t.signIn.start }));
  return view;
}

describe("SignInPage", () => {
  it("starts on the admin route and opens WhatsApp with the ready message", async () => {
    await startSignIn();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://site.example/api/admin/verification/start");
    expect(JSON.parse(String(init.body))).toHaveProperty("clientKey");
    expect(opened.location.href).toBe(
      `https://wa.me/971500000000?text=${encodeURIComponent(started.message)}`,
    );
    expect(screen.getByText(t.signIn.waiting)).toBeInTheDocument();
    expect(m.statusArgs).toEqual({ verificationId: "v1", secret: "s1" });
  });

  it("pastes the code copied from WhatsApp into the field", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue(" 654321 ") },
    });
    const { rerender } = await startSignIn();
    m.status = { status: "needs_pin", maskedPhone: null };
    rerender(<SignInPage />);

    await userEvent.click(
      screen.getByRole("button", { name: t.signIn.pinPaste }),
    );
    expect(screen.getByLabelText(t.signIn.pinLabel)).toHaveValue("654321");
  });

  it("says so when the clipboard has no code", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: vi.fn().mockResolvedValue("hello") },
    });
    const { rerender } = await startSignIn();
    m.status = { status: "needs_pin", maskedPhone: null };
    rerender(<SignInPage />);

    await userEvent.click(
      screen.getByRole("button", { name: t.signIn.pinPaste }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.signIn.pinPasteEmpty,
    );
  });

  it("takes the code in Arabic digits and stores the admin token", async () => {
    m.confirmPin.mockResolvedValue({ adminToken: "tok" });
    const { rerender } = await startSignIn();
    m.status = { status: "needs_pin", maskedPhone: null };
    rerender(<SignInPage />);

    await userEvent.type(screen.getByLabelText(t.signIn.pinLabel), "١٢٣٤٥٦");
    await userEvent.click(
      screen.getByRole("button", { name: t.signIn.confirm }),
    );

    expect(m.confirmPin).toHaveBeenCalledWith(
      expect.objectContaining({
        verificationId: "v1",
        secret: "s1",
        pin: "١٢٣٤٥٦",
      }),
    );
    expect(m.setToken).toHaveBeenCalledWith("tok");
  });

  it("shows a wrong code and lets the admin try again", async () => {
    m.confirmPin.mockResolvedValue({ error: "wrong_pin" });
    const { rerender } = await startSignIn();
    m.status = { status: "needs_pin", maskedPhone: null };
    rerender(<SignInPage />);
    await userEvent.type(screen.getByLabelText(t.signIn.pinLabel), "000000");
    await userEvent.click(
      screen.getByRole("button", { name: t.signIn.confirm }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.signIn.errors.wrong_pin,
    );
    expect(screen.getByLabelText(t.signIn.pinLabel)).toBeInTheDocument();
    expect(m.setToken).not.toHaveBeenCalled();
  });

  it("starts over after too many attempts", async () => {
    m.confirmPin.mockResolvedValue({ error: "too_many_attempts" });
    const { rerender } = await startSignIn();
    m.status = { status: "needs_pin", maskedPhone: null };
    rerender(<SignInPage />);
    await userEvent.type(screen.getByLabelText(t.signIn.pinLabel), "000000");
    await userEvent.click(
      screen.getByRole("button", { name: t.signIn.confirm }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.signIn.errors.too_many_attempts,
    );
    await userEvent.click(screen.getByRole("button", { name: t.signIn.again }));
    expect(
      screen.getByRole("button", { name: t.signIn.start }),
    ).toBeInTheDocument();
  });

  it("shows an expired code as an error with a fresh start", async () => {
    const { rerender } = await startSignIn();
    m.status = { status: "expired", maskedPhone: null };
    rerender(<SignInPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.signIn.errors.expired,
    );
    expect(
      screen.getByRole("button", { name: t.signIn.again }),
    ).toBeInTheDocument();
  });

  it("closes the blank tab and says why when the start is refused", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    await startSignIn();
    expect(opened.close).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      t.signIn.errors.rate_limited,
    );
  });
});
