import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClaimVisitorHelp } from "./useClaimVisitorHelp";

const m = vi.hoisted(() => ({
  session: "member" as string | undefined,
  token: "reporter" as string | null,
  claim: vi.fn(),
  forget: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => m.claim }));
vi.mock("../../lib/session", () => ({ useSessionToken: () => m.session }));
vi.mock("./reporterToken", () => ({
  getReporterToken: () => m.token,
  forgetReporterToken: () => m.forget(),
}));

beforeEach(() => {
  m.session = "member";
  m.token = "reporter";
  m.claim.mockReset().mockResolvedValue({ moved: 2 });
  m.forget.mockReset();
});

describe("useClaimVisitorHelp", () => {
  it("moves this browser's requests to the account once, then forgets the token", async () => {
    const { rerender } = renderHook(() => useClaimVisitorHelp());
    rerender();
    await waitFor(() => expect(m.forget).toHaveBeenCalled());
    expect(m.claim).toHaveBeenCalledTimes(1);
    expect(m.claim).toHaveBeenCalledWith({
      sessionToken: "member",
      reporterToken: "reporter",
    });
  });

  it("does nothing signed out, or without a reporter token", () => {
    m.session = undefined;
    renderHook(() => useClaimVisitorHelp());
    m.session = "member";
    m.token = null;
    renderHook(() => useClaimVisitorHelp());
    expect(m.claim).not.toHaveBeenCalled();
  });
});
