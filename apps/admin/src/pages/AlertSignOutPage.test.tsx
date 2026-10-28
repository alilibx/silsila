import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { AlertSignOutPage } from "./AlertSignOutPage";

const m = vi.hoisted(() => ({
  signOut: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("convex/react", () => ({ useMutation: () => m.signOut }));
vi.mock("../lib/adminSession", () => ({ clearAdminToken: () => m.clear() }));

function renderAt(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AlertSignOutPage />
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  m.signOut.mockReset();
  m.clear.mockReset();
});

describe("AlertSignOutPage", () => {
  it("ends every admin session once and clears this browser's token", async () => {
    m.signOut.mockResolvedValue({ ok: true });
    renderAt("/signout?t=alert-123");
    expect(await screen.findByText(t.signOut.done)).toBeInTheDocument();
    expect(m.signOut).toHaveBeenCalledTimes(1);
    expect(m.signOut).toHaveBeenCalledWith({ alertToken: "alert-123" });
    expect(m.clear).toHaveBeenCalled();
  });

  it("says when the link is no good", async () => {
    m.signOut.mockResolvedValue({ ok: false });
    renderAt("/signout?t=used");
    expect(await screen.findByText(t.signOut.invalid)).toBeInTheDocument();
  });

  it("doesn't call the server without a token", async () => {
    renderAt("/signout");
    expect(await screen.findByText(t.signOut.invalid)).toBeInTheDocument();
    expect(m.signOut).not.toHaveBeenCalled();
  });
});
