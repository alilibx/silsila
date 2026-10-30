import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "../../i18n/ar";
import { SavedPicker } from "./SavedPicker";

const m = vi.hoisted(() => ({
  saved: undefined as unknown,
  addSaved: vi.fn(),
}));

vi.mock("../../lib/session", () => ({
  useSessionToken: () => "tok",
  getSessionToken: () => "tok",
}));
vi.mock("convex/react", () => ({
  useQuery: () => m.saved,
  useMutation: () => m.addSaved,
}));

const contacts = [
  { id: "c1", name: "أم خالد", phone: "+971501234567", inKhatma: false },
  { id: "c2", name: "سعد", phone: null, inKhatma: false },
  { id: "c3", name: "نورة", phone: "+971507654321", inKhatma: true },
];

const sheet = () => screen.getByRole("dialog", { name: t.rota.savedTitle });

beforeEach(() => {
  m.saved = contacts;
  m.addSaved.mockReset().mockResolvedValue({ ok: true });
});

describe("SavedPicker", () => {
  it("lists the saved people; a hidden number is not shown, and who is in already cannot be pressed", () => {
    render(<SavedPicker inviteCode="CODE" onClose={() => {}} />);
    const list = within(sheet()).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("+971501234567")).toBeInTheDocument();
    expect(within(list).getByText("نورة").closest("button")).toBeDisabled();
    expect(within(list).getByText(t.rota.savedInKhatma)).toBeInTheDocument();
    expect(within(list).getByText("سعد").closest("button")).not.toBeDisabled();
    // Only the free person with a number shows one: not the hidden one, nor who is in already.
    expect(within(list).getAllByText(/^\+971/)).toHaveLength(1);
  });

  it("adds a person to the khatma's first free juz', and stays open for the next", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAdded = vi.fn();
    render(
      <SavedPicker inviteCode="CODE" onClose={onClose} onAdded={onAdded} />,
    );
    await user.click(screen.getByRole("button", { name: /أم خالد/ }));
    expect(m.addSaved).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      contactId: "c1",
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("for one juz', adds there and closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SavedPicker inviteCode="CODE" juz={7} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /سعد/ }));
    expect(m.addSaved).toHaveBeenCalledWith({
      sessionToken: "tok",
      inviteCode: "CODE",
      contactId: "c2",
      juz: 7,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not press a person already in the khatma", async () => {
    const user = userEvent.setup();
    render(<SavedPicker inviteCode="CODE" onClose={() => {}} />);
    await user.click(screen.getByRole("button", { name: /نورة/ }));
    expect(m.addSaved).not.toHaveBeenCalled();
  });

  it.each([
    ["already_added", t.rota.savedErrors.already_added],
    ["juz_taken", t.rota.savedErrors.juz_taken],
    ["not_found", t.rota.savedErrors.not_found],
  ])(
    "a refusal (%s) is said plainly and keeps the sheet open",
    async (code, line) => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      m.addSaved.mockResolvedValue({ error: code });
      render(<SavedPicker inviteCode="CODE" juz={7} onClose={onClose} />);
      await user.click(screen.getByRole("button", { name: /أم خالد/ }));
      expect(await screen.findByRole("alert")).toHaveTextContent(line ?? "");
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("while the list loads, or when it is empty, says nothing is pressable", () => {
    m.saved = undefined;
    const { rerender } = render(
      <SavedPicker inviteCode="CODE" onClose={() => {}} />,
    );
    expect(within(sheet()).queryByRole("listitem")).toBeNull();
    m.saved = [];
    rerender(<SavedPicker inviteCode="CODE" onClose={() => {}} />);
    expect(within(sheet()).queryByRole("listitem")).toBeNull();
  });
});
