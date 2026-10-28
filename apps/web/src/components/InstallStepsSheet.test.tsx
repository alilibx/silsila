import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSessionToken } from "../lib/session";
import { InstallStepsSheet } from "./InstallStepsSheet";

const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    action = m.action;
  },
}));

function Host() {
  const [open, setOpen] = useState(true);
  return open ? <InstallStepsSheet onClose={() => setOpen(false)} /> : <p>x</p>;
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://x.convex.cloud");
  localStorage.clear();
  setSessionToken("sess");
  m.action.mockReset().mockResolvedValue({ token: "hand-off-secret" });
  document.head.innerHTML =
    '<link rel="manifest" href="/manifest.webmanifest">';
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "وِردك", start_url: "/", scope: "/" }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  document.head.innerHTML = "";
});

describe("InstallStepsSheet", () => {
  it("shows the three steps with text labels", async () => {
    URL.createObjectURL = vi.fn(() => "blob:test/1");
    URL.revokeObjectURL = vi.fn();
    render(<Host />);
    await act(async () => {});
    expect(screen.getByText("اضغط زر المشاركة")).toBeInTheDocument();
    expect(screen.getByText(/إضافة إلى الشاشة الرئيسية/)).toBeInTheDocument();
    expect(screen.getByText(/أضف/, { selector: "li *" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أضفتُه" })).toBeInTheDocument();
    expect(screen.getByText(/الآن، ونافذة الخطوات/)).toBeInTheDocument();
  });

  it("puts the token only in the manifest, never in location, and restores the manifest on close", async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return "blob:test/1";
    });
    URL.revokeObjectURL = vi.fn();
    const href = window.location.href;
    const length = window.history.length;

    render(<Host />);
    const link = document.querySelector('link[rel="manifest"]')!;
    await waitFor(() => expect(link.getAttribute("href")).toBe("blob:test/1"));
    expect(m.action.mock.calls[0]?.[1]).toEqual({ sessionToken: "sess" });
    expect(JSON.parse(await readBlob(blob!)).start_url).toBe(
      `${window.location.origin}/?h=hand-off-secret`,
    );
    expect(window.location.href).toBe(href);
    expect(window.location.href).not.toContain("hand-off-secret");
    expect(window.history.length).toBe(length);
    expect(document.body.innerHTML).not.toContain("hand-off-secret");

    await userEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(link.getAttribute("href")).toBe("/manifest.webmanifest");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test/1");
  });

  it("works when opened again from anywhere, with a fresh token each time", async () => {
    URL.createObjectURL = vi.fn(() => "blob:test/again");
    URL.revokeObjectURL = vi.fn();
    m.action
      .mockResolvedValueOnce({ token: "first" })
      .mockResolvedValueOnce({ token: "second" });
    const link = () => document.querySelector('link[rel="manifest"]')!;
    for (let i = 1; i <= 2; i++) {
      const { unmount } = render(<Host />);
      await waitFor(() =>
        expect(link().getAttribute("href")).toBe("blob:test/again"),
      );
      expect(m.action).toHaveBeenCalledTimes(i);
      unmount();
      expect(link().getAttribute("href")).toBe("/manifest.webmanifest");
    }
  });

  it("closes from either button: added, or not now", async () => {
    URL.createObjectURL = vi.fn(() => "blob:test/1");
    URL.revokeObjectURL = vi.fn();
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "ليس الآن" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("restores the manifest even when closed before the token arrived", async () => {
    URL.createObjectURL = vi.fn(() => "blob:test/2");
    URL.revokeObjectURL = vi.fn();
    let release: (v: unknown) => void = () => {};
    m.action.mockReturnValue(new Promise((r) => (release = r)));
    render(<Host />);
    await userEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    await act(async () => release({ token: "late" }));
    expect(
      document.querySelector('link[rel="manifest"]')?.getAttribute("href"),
    ).toBe("/manifest.webmanifest");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
