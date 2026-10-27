import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePage } from "./CreatePage";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  token: undefined as string | undefined,
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => m.token,
  getSessionToken: () => m.token ?? null,
}));
vi.mock("../features/verify/VerifySheet", () => ({
  VerifySheet: (props: {
    title: string;
    onVerified: () => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={props.title}>
      <button
        onClick={() => {
          m.token = "fresh-token";
          props.onVerified();
        }}
      >
        verified
      </button>
      <button onClick={props.onClose}>close</button>
    </div>
  ),
}));
vi.mock("convex/react", () => ({ useAction: () => m.create }));

function Landing() {
  const location = useLocation();
  return (
    <p>
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/new"]}>
      <Routes>
        <Route path="/new" element={<CreatePage />} />
        <Route path="/j/:inviteCode" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CreatePage", () => {
  beforeEach(() => {
    m.create.mockReset();
    m.create.mockResolvedValue({ inviteCode: "NEWCODE" });
    m.token = "tok";
  });

  it("offers exactly six schedules and no yearly, weekly by default", () => {
    renderPage();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(6);
    expect(screen.getByRole("radio", { name: /أسبوعية/ })).toBeChecked();
    expect(screen.queryByText(/سنوية|سنة/)).not.toBeInTheDocument();
    expect(screen.getByText("نختم كل يوم")).toBeInTheDocument();
    expect(screen.getByText("الأكثر شيوعاً")).toBeInTheDocument();
    expect(screen.getByText("نقرأ على راحتنا")).toBeInTheDocument();
  });

  it("create with an empty name sends null, then goes to the new khatma", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/اسم الختمة/), "   ");
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    expect(m.create).toHaveBeenCalledWith({
      sessionToken: "tok",
      name: null,
      schedule: "weekly",
    });
    expect(await screen.findByText(/\/j\/NEWCODE/)).toHaveTextContent(
      '{"justCreated":true}',
    );
  });

  it("sends the trimmed name and the chosen schedule", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/اسم الختمة/), "  ختمة الأصدقاء ");
    await user.click(screen.getByRole("radio", { name: /يومية/ }));
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    expect(m.create).toHaveBeenCalledWith({
      sessionToken: "tok",
      name: "ختمة الأصدقاء",
      schedule: "daily",
    });
  });

  it("signed out: verifies first, then creates with the chosen values", async () => {
    m.token = undefined;
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("radio", { name: /شهرية/ }));
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    expect(m.create).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "قبل أن تنشئ ختمة" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "verified" }));
    expect(m.create).toHaveBeenCalledWith({
      sessionToken: "fresh-token",
      name: null,
      schedule: "monthly",
    });
    expect(await screen.findByText(/\/j\/NEWCODE/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closing the verify sheet creates nothing", async () => {
    m.token = undefined;
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    await user.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("disables the button while creating and creates only once", async () => {
    let resolve: (v: { inviteCode: string }) => void = () => {};
    m.create.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    const busy = screen.getByRole("button", { name: "جارٍ الإنشاء" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(m.create).toHaveBeenCalledTimes(1);
    resolve({ inviteCode: "X" });
    expect(await screen.findByText(/\/j\/X/)).toBeInTheDocument();
  });

  it("explains a rate limit kindly and stays on the page", async () => {
    m.create.mockRejectedValue(new ConvexError({ code: "rate_limited" }));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "أنشأتَ ختمات كثيرة اليوم",
    );
    expect(screen.getByRole("button", { name: "أنشئ الختمة" })).toBeEnabled();
  });

  it("shows the network copy when the call itself fails", async () => {
    m.create.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "أنشئ الختمة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذّر الاتصال");
  });
});
