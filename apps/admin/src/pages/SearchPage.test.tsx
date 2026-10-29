import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../i18n/ar";
import { SearchPage } from "./SearchPage";

const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("convex/react", () => ({
  useConvex: () => ({ query: m.query }),
  useMutation: () => vi.fn(),
}));
vi.mock("../lib/adminSession", () => ({ useAdminToken: () => "tok" }));

beforeEach(() => {
  m.query.mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/search"]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        <Route path="/people/:personId" element={<p>person page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SearchPage", () => {
  it("goes straight to the person's page from a phone number", async () => {
    m.query.mockResolvedValue({
      personId: "p1",
      displayName: "سارة",
      phone: "+971500000001",
      blocked: false,
    });
    renderPage();
    await userEvent.type(
      screen.getByLabelText(t.lookup.personLabel),
      "+971500000001",
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: t.lookup.find })[1]!,
    );
    expect(await screen.findByText("person page")).toBeInTheDocument();
  });

  it("lists khatmas found by name", async () => {
    m.query.mockResolvedValue([
      { khatmaId: "k1", name: "ختمة العائلة", inviteCode: "abc", members: 4 },
    ]);
    renderPage();
    await userEvent.type(
      screen.getByLabelText(t.lookup.khatmaLabel),
      "العائلة",
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: t.lookup.find })[0]!,
    );
    expect(
      await screen.findByRole("link", { name: /ختمة العائلة/ }),
    ).toHaveAttribute("href", "/khatmas/k1");
  });
});
