import { act, render, screen, within } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BottomBarProvider,
  useHideBottomBar,
} from "../features/nav/bottomBarUi";
import { t } from "../i18n/ar";
import { BottomBar } from "./BottomBar";

const m = vi.hoisted(() => ({
  me: undefined as unknown,
  mine: undefined as unknown,
  clear: vi.fn(),
  mineArgs: [] as unknown[],
}));

vi.mock("../lib/session", () => ({
  useSessionToken: () => "token",
  getSessionToken: () => "token",
  clearSessionToken: () => m.clear(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: never, args: unknown) => {
      if (getFunctionName(ref) === "sessions:me") return m.me;
      m.mineArgs.push(args);
      return m.mine;
    },
  };
});

const card = {
  inviteCode: "A",
  name: "ختمة العائلة",
  createdAt: 0,
  schedule: "weekly",
  done: 18,
  holding: null,
  hasNote: false,
};

function Hider() {
  useHideBottomBar();
  return null;
}

function renderAt(url: string, extra: React.ReactNode = null) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <BottomBarProvider>
        {extra}
        <BottomBar />
      </BottomBarProvider>
    </MemoryRouter>,
  );
}

const current = () =>
  screen.getAllByRole("link").filter((l) => l.hasAttribute("aria-current"));

describe("BottomBar", () => {
  beforeEach(() => {
    m.clear.mockReset();
    m.mineArgs = [];
    m.me = { displayName: "علي", maskedPhone: "+971 50 ••• 1234" };
    m.mine = [card];
  });

  it("shows three labelled links for a signed-in person on home", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: t.nav.label });
    expect(within(nav).getByRole("link", { name: t.nav.home })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(nav).getByRole("link", { name: t.nav.create }),
    ).toHaveAttribute("href", "/new");
    expect(
      within(nav).getByRole("link", { name: t.nav.settings }),
    ).toHaveAttribute("href", "/settings");
  });

  it.each([
    ["/", t.nav.home, "page"],
    // Inside a khatma ختماتي is the section, not the page: it links somewhere else.
    ["/j/CODE", t.nav.home, "true"],
    ["/new", t.nav.create, "page"],
    ["/settings", t.nav.settings, "page"],
  ])("marks the active link on %s", (url, name, value) => {
    renderAt(url);
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAccessibleName(name);
    expect(current()[0]).toHaveAttribute("aria-current", value);
  });

  it("marks no link on an unknown path, but still shows", () => {
    renderAt("/nope");
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(current()).toHaveLength(0);
  });

  it("hides for a signed-out person", () => {
    m.me = null;
    renderAt("/");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("clears a stored token the server answers as signed out, on any page", () => {
    // /new has no dead-token check of its own; once cleared, it shows its back link again.
    m.me = null;
    renderAt("/new");
    expect(m.clear).toHaveBeenCalledTimes(1);
  });

  it("keeps the token while the session is loading", () => {
    m.me = undefined;
    renderAt("/new");
    expect(m.clear).not.toHaveBeenCalled();
  });

  it("does not ask for khatmas until the person is signed in", () => {
    m.me = null;
    renderAt("/");
    expect(m.mineArgs).not.toHaveLength(0);
    expect(m.mineArgs.every((args) => args === "skip")).toBe(true);
  });

  it("hides while the session is loading", () => {
    m.me = undefined;
    renderAt("/");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it.each(["/j/CODE/settings", "/signout"])("hides on %s", (url) => {
    renderAt(url);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("hides while a screen calls useHideBottomBar", () => {
    renderAt("/", <Hider />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("is already gone in the first paint of a screen that hides it", () => {
    // flushSync commits without flushing passive effects, which run only after the browser paints.
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() =>
      root.render(
        <MemoryRouter initialEntries={["/"]}>
          <BottomBarProvider>
            <Hider />
            <BottomBar />
          </BottomBarProvider>
        </MemoryRouter>,
      ),
    );
    expect(container.querySelector("nav")).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it("adds the new-message dot to ختماتي when a khatma has a note", () => {
    m.mine = [card, { ...card, inviteCode: "B", hasNote: true }];
    renderAt("/settings");
    expect(
      screen.getByRole("link", {
        name: `${t.nav.home}${t.common.listSeparator}${t.notes.newMessage}`,
      }),
    ).toHaveAttribute("href", "/");
  });

  describe("--nav-h", () => {
    let height = 72;
    let notify: (() => void) | null = null;
    let options: unknown = null;
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");

    beforeEach(() => {
      height = 72;
      rect.mockImplementation(() => ({ height }) as DOMRect);
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(cb: () => void) {
            notify = cb;
          }
          observe(_el: Element, opts?: unknown) {
            options = opts;
            notify?.();
          }
          disconnect() {
            notify = null;
          }
        },
      );
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      rect.mockReset();
      document.documentElement.style.removeProperty("--nav-h");
    });

    const navH = () =>
      document.documentElement.style.getPropertyValue("--nav-h");

    it("follows the bar's measured height", () => {
      renderAt("/");
      expect(navH()).toBe("72px");
      height = 110;
      act(() => notify?.());
      expect(navH()).toBe("110px");
    });

    it("watches the border box, so a change in the iPhone's safe area is tracked", () => {
      renderAt("/");
      expect(options).toEqual({ box: "border-box" });
    });

    it("is cleared when the bar goes away", () => {
      const { unmount } = renderAt("/");
      expect(navH()).toBe("72px");
      unmount();
      expect(navH()).toBe("");
    });
  });
});
