import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("SignOutPage", () => {
  beforeEach(() => {
    m.signOut.mockReset();
    m.clear.mockReset();
    m.local = null;
    sessionStorage.clear();
  });

  it("reports an invalid link", async () => {
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=bad");
    expect(await screen.findByText("هذا الرابط لم يعد صالحاً.")).toBeVisible();
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("reports an invalid link without calling the server when there is no token", () => {
    renderAt("/signout");
    expect(screen.getByText("هذا الرابط لم يعد صالحاً.")).toBeVisible();
    expect(m.signOut).not.toHaveBeenCalled();
  });

  it("keeps this device signed in when its session survived", async () => {
    m.local = "local-session";
    m.signOut.mockResolvedValue({ ok: true, keptCurrent: true });
    renderAt("/signout?t=alert1");
    expect(
      await screen.findByText(
        "سجّلنا خروج الأجهزة الأخرى. هذا الجهاز ما زال مسجّلاً.",
      ),
    ).toBeVisible();
    expect(m.signOut).toHaveBeenCalledWith({
      alertToken: "alert1",
      sessionToken: "local-session",
    });
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("signs out everywhere and clears the local token otherwise", async () => {
    m.local = "local-session";
    m.signOut.mockResolvedValue({ ok: true, keptCurrent: false });
    renderAt("/signout?t=alert1");
    expect(
      await screen.findByText("سجّلنا خروجك من كل الأجهزة."),
    ).toBeVisible();
    expect(m.clear).toHaveBeenCalledTimes(1);
  });

  it("calls the server once even when StrictMode runs the effect twice", async () => {
    m.signOut.mockResolvedValue({ ok: true, keptCurrent: false });
    renderAt("/signout?t=alert1", true);
    expect(
      await screen.findByText("سجّلنا خروجك من كل الأجهزة."),
    ).toBeVisible();
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.signOut).toHaveBeenCalledWith({
      alertToken: "alert1",
      sessionToken: undefined,
    });
  });

  it("shows the same result after a reload (token stripped, outcome remembered)", async () => {
    m.signOut.mockResolvedValue({ ok: true, keptCurrent: false });
    const first = renderAt("/signout?t=alert1");
    await screen.findByText("سجّلنا خروجك من كل الأجهزة.");
    first.unmount();
    renderAt("/signout");
    expect(screen.getByText("سجّلنا خروجك من كل الأجهزة.")).toBeVisible();
    // And re-opening the same link does not spend the token again.
    renderAt("/signout?t=alert1");
    expect(m.signOut).toHaveBeenCalledTimes(1);
  });

  it("removes the token from the address bar and never stores it", async () => {
    window.history.replaceState({ idx: 3 }, "", "/signout?t=secret-alert");
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=secret-alert");
    await screen.findByText("هذا الرابط لم يعد صالحاً.");
    expect(window.location.search).toBe("");
    expect(window.history.state).toEqual({ idx: 3 });
    const stored = JSON.stringify(Object.entries(sessionStorage));
    expect(stored).not.toContain("secret-alert");
  });

  it("offers a way home", async () => {
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=x");
    await screen.findByText("هذا الرابط لم يعد صالحاً.");
    expect(
      screen.getByRole("link", { name: "الصفحة الرئيسية" }),
    ).toHaveAttribute("href", "/");
  });

  it("explains a network failure and lets the user retry", async () => {
    m.signOut.mockRejectedValueOnce(new Error("offline"));
    m.signOut.mockResolvedValueOnce({ ok: true, keptCurrent: false });
    renderAt("/signout?t=alert1");
    const retry = await screen.findByRole("button", {
      name: "حاول مرة أخرى",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر الاتصال");
    retry.click();
    expect(
      await screen.findByText("سجّلنا خروجك من كل الأجهزة."),
    ).toBeVisible();
  });
});
