import type { Id } from "@convex/_generated/dataModel";
import { renderHook } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  RotaBackendProvider,
  useRotaBackend,
  type RotaBackend,
} from "./backend";

const session = vi.hoisted(() => ({ token: "tok" as string | null }));

vi.mock("../../lib/session", () => ({
  useSessionToken: () => "render-tok",
  getSessionToken: () => session.token,
}));

describe("useRotaBackend", () => {
  it("is the organizer's own functions without a provider", () => {
    const { result } = renderHook(() => useRotaBackend("abc"));
    expect(getFunctionName(result.current.today)).toBe("rota:today");
    expect(getFunctionName(result.current.archive)).toBe(
      "khatmaLifecycle:archive",
    );
    expect(result.current.scope).toEqual({
      sessionToken: "render-tok",
      inviteCode: "abc",
    });
  });

  it("reads the session token as the call goes out", () => {
    const { result } = renderHook(() => useRotaBackend("abc"));
    session.token = "later";
    expect(result.current.authArgs()).toEqual({
      sessionToken: "later",
      inviteCode: "abc",
    });
    session.token = null;
    expect(result.current.authArgs()).toEqual({
      sessionToken: undefined,
      inviteCode: "abc",
    });
  });

  it("is the provider's backend inside one", () => {
    const scope = { adminToken: "adm", khatmaId: "k1" as Id<"khatmas"> };
    const backend = {
      ...renderHook(() => useRotaBackend("abc")).result.current,
      scope,
      authArgs: () => scope,
    } satisfies RotaBackend;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RotaBackendProvider backend={backend}>{children}</RotaBackendProvider>
    );
    const { result } = renderHook(() => useRotaBackend("abc"), { wrapper });
    expect(result.current).toBe(backend);
  });
});
