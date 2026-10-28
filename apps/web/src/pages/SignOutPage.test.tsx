import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { SignOutPage } from "./SignOutPage";

const m = vi.hoisted(() => ({
  signOut: vi.fn(),
  local: null as string | null,
  clear: vi.fn(),
}));

vi.mock("../lib/session", () => ({
  getSessionToken: () => m.local,
  clearSessionToken: () => m.clear(),
}));
vi.mock("convex/react", () => ({ useMutation: () => m.signOut }));

function renderAt(url: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[url]}>
      <SignOutPage />
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Taps "yes, sign out" on the confirm step. */
async function confirm() {
  await userEvent.click(
    screen.getByRole("button", { name: t.signOut.confirm }),
  );
}

const ALL = "سجّلنا خروجك من كل الأجهزة.";
const KEPT = "سجّلنا خروج الأجهزة الأخرى. هذا الجهاز ما زال مسجّلاً.";
const OWNER = "سجّلنا خروج كل أجهزة صاحب الرقم.";
const INVALID = "هذا الرابط لم يعد صالحاً.";

describe("SignOutPage", () => {
  beforeEach(() => {
    m.signOut.mockReset();
    m.clear.mockReset();
    m.local = null;
    sessionStorage.clear();
  });

  it("asks first: explains, and calls the server only on the confirm tap", async () => {
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    expect(screen.getByText(t.signOut.confirmBody)).toBeVisible();
    expect(m.signOut).not.toHaveBeenCalled();
    await confirm();
    expect(await screen.findByText(ALL)).toBeVisible();
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it("reports an invalid link", async () => {
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=bad");
    await confirm();
    expect(await screen.findByText(INVALID)).toBeVisible();
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("reports an invalid link without asking or calling the server when there is no token", () => {
    renderAt("/signout");
    expect(screen.getByText(INVALID)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: t.signOut.confirm }),
    ).toBeNull();
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("keeps this device signed in when its session survived", async () => {
    m.local = "local-session";
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: true,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(KEPT)).toBeVisible();
    expect(m.signOut).toHaveBeenCalledWith({
      alertToken: "alert1",
      sessionToken: "local-session",
    });
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("clears the local token only when this device was one of those signed out", async () => {
    m.local = "local-session";
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: false,
      callerAffected: true,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(ALL)).toBeVisible();
    expect(m.clear).toHaveBeenCalledTimes(1);
  });

  it("someone else's session on a shared phone stays, with a neutral message", async () => {
    m.local = "someone-elses-session";
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(OWNER)).toBeVisible();
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("with no session here (e.g. WhatsApp's own browser) it tells the owner all devices are out", async () => {
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(ALL)).toBeVisible();
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("calls the server once under StrictMode, even on a double tap", async () => {
    let resolve: (v: unknown) => void = () => {};
    m.signOut.mockReturnValue(new Promise((r) => (resolve = r)));
    renderAt("/signout?t=alert1", true);
    expect(m.signOut).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: t.signOut.confirm });
    await userEvent.click(button);
    await userEvent.click(button);
    resolve({ ok: true, keptCurrent: false, callerAffected: false });
    expect(await screen.findByText(ALL)).toBeVisible();
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.signOut).toHaveBeenCalledWith({
      alertToken: "alert1",
      sessionToken: undefined,
    });
  });

  it("shows the same result after a reload (token stripped, outcome remembered)", async () => {
    m.signOut.mockResolvedValue({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    const first = renderAt("/signout?t=alert1");
    await confirm();
    await screen.findByText(ALL);
    first.unmount();
    const second = renderAt("/signout");
    expect(screen.getByText(ALL)).toBeVisible();
    second.unmount();
    // Re-opening the same link shows the outcome without asking or spending the token again.
    renderAt("/signout?t=alert1");
    expect(screen.getByText(ALL)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: t.signOut.confirm }),
    ).toBeNull();
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it("removes the token from the address bar and never stores it", async () => {
    window.history.replaceState({ idx: 3 }, "", "/signout?t=secret-alert");
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=secret-alert");
    await confirm();
    await screen.findByText(INVALID);
    expect(window.location.search).toBe("");
    expect(window.history.state).toEqual({ idx: 3 });
    const stored = JSON.stringify(Object.entries(sessionStorage));
    expect(stored).not.toContain("secret-alert");
  });

  it("keeps the token in the address bar until the person confirms", () => {
    window.history.replaceState(null, "", "/signout?t=alert1");
    renderAt("/signout?t=alert1");
    expect(window.location.search).toBe("?t=alert1");
  });

  it("offers a way home, on the confirm step too", async () => {
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=x");
    expect(
      screen.getByRole("link", { name: "الصفحة الرئيسية" }),
    ).toHaveAttribute("href", "/");
    await confirm();
    await screen.findByText(INVALID);
    expect(
      screen.getByRole("link", { name: "الصفحة الرئيسية" }),
    ).toHaveAttribute("href", "/");
  });

  it("explains a network failure and lets the user retry", async () => {
    m.signOut.mockRejectedValueOnce(new Error("offline"));
    m.signOut.mockResolvedValueOnce({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    const retry = await screen.findByRole("button", {
      name: "حاول مرة أخرى",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر الاتصال");
    await userEvent.click(retry);
    expect(await screen.findByText(ALL)).toBeVisible();
  });

  it("keeps the token in the address bar after a network failure, so a reload can try again", async () => {
    window.history.replaceState(null, "", "/signout?t=alert1");
    m.signOut.mockRejectedValueOnce(new Error("offline"));
    const first = renderAt("/signout?t=alert1");
    await confirm();
    await screen.findByRole("alert");
    expect(window.location.search).toBe("?t=alert1");
    first.unmount();
    m.signOut.mockResolvedValueOnce({
      ok: true,
      keptCurrent: false,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(ALL)).toBeVisible();
    expect(m.signOut).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("");
  });

  it("keeps the token in the address bar while the call is in flight", async () => {
    window.history.replaceState(null, "", "/signout?t=alert1");
    m.signOut.mockReturnValueOnce(new Promise(() => {}));
    const first = renderAt("/signout?t=alert1");
    await confirm();
    expect(window.location.search).toBe("?t=alert1");
    expect(screen.queryByText(INVALID)).toBeNull();
    first.unmount();
    m.local = "local-session";
    m.signOut.mockResolvedValueOnce({
      ok: true,
      keptCurrent: true,
      callerAffected: false,
    });
    renderAt("/signout?t=alert1");
    await confirm();
    expect(await screen.findByText(KEPT)).toBeVisible();
    expect(window.location.search).toBe("");
  });
});
