import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { t } from "./i18n/ar";

const m = vi.hoisted(() => ({
  me: undefined as unknown,
  token: "admin-token" as string | null,
}));

vi.mock("./lib/adminSession", () => ({
  useAdminToken: () => m.token,
  clearAdminToken: vi.fn(),
  setAdminToken: vi.fn(),
  getAdminToken: () => m.token,
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never) =>
      getFunctionName(ref) === "adminAuth:me" ? m.me : undefined,
    useMutation: () => vi.fn(),
    useAction: () => vi.fn(),
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  m.me = undefined;
  m.token = "admin-token";
});

describe("App", () => {
  it("shows sign-in on every route when there's no admin", () => {
    m.me = null;
    renderAt("/settings");
    expect(
      screen.getByRole("heading", { name: t.signIn.title }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: t.nav.settings }),
    ).not.toBeInTheDocument();
  });

  it("shows the four sections to a signed-in admin", () => {
    m.me = { adminId: "a1", phone: "+971500000001", expiresAt: 0 };
    renderAt("/");
    for (const name of [
      t.nav.home,
      t.nav.settings,
      t.nav.audit,
      t.nav.admins,
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(t.badge)).toBeInTheDocument();
  });

  it("renders nothing while it checks the session", () => {
    const { container } = renderAt("/");
    expect(container).toBeEmptyDOMElement();
  });
});
