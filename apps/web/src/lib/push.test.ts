import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  currentEndpoint,
  dropSubscription,
  enablePush,
  isStandalone,
  pushBlocked,
  pushSupport,
  syncPush,
} from "./push";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query = m.query;
    mutation = m.mutation;
  },
}));

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

type Nav = Parameters<typeof pushSupport>[0];
const nav = (over: Record<string, unknown>) =>
  ({
    userAgent: CHROME_UA,
    maxTouchPoints: 0,
    serviceWorker: {},
    ...over,
  }) as Nav;
const win = (over: Record<string, unknown> = {}) =>
  ({
    PushManager: class {},
    matchMedia: () => ({ matches: false }),
    ...over,
  }) as unknown as Window;

describe("pushSupport", () => {
  it("asks an iPhone Safari tab to install the app first", () => {
    expect(pushSupport(nav({ userAgent: IPHONE_UA }), win())).toBe(
      "ios_install",
    );
    // Safari before install has no PushManager at all; it is still an install case.
    expect(
      pushSupport(
        nav({ userAgent: IPHONE_UA }),
        win({ PushManager: undefined }),
      ),
    ).toBe("ios_install");
  });

  it("treats a touch-screen Macintosh user agent (iPadOS) as iOS", () => {
    expect(
      pushSupport(nav({ userAgent: IPAD_AS_MAC_UA, maxTouchPoints: 5 }), win()),
    ).toBe("ios_install");
    // A real Mac has no touch points and is just a desktop browser.
    expect(pushSupport(nav({ userAgent: IPAD_AS_MAC_UA }), win())).toBe(
      "ready",
    );
  });

  it("is ready for the home-screen app on iPhone", () => {
    expect(
      pushSupport(nav({ userAgent: IPHONE_UA, standalone: true }), win()),
    ).toBe("ready");
    expect(
      pushSupport(
        nav({ userAgent: IPHONE_UA }),
        win({ matchMedia: () => ({ matches: true }) }),
      ),
    ).toBe("ready");
  });

  it("is ready on desktop and unsupported without a service worker or PushManager", () => {
    expect(pushSupport(nav({}), win())).toBe("ready");
    const noWorker = nav({});
    delete (noWorker as unknown as Record<string, unknown>).serviceWorker;
    expect(pushSupport(noWorker, win())).toBe("unsupported");
    expect(pushSupport(nav({}), win({ PushManager: undefined }))).toBe(
      "unsupported",
    );
  });
});

describe("isStandalone", () => {
  it("is true for navigator.standalone or the display-mode query", () => {
    expect(isStandalone(win(), nav({ standalone: true }))).toBe(true);
    expect(
      isStandalone(win({ matchMedia: () => ({ matches: true }) }), nav({})),
    ).toBe(true);
    expect(isStandalone(win(), nav({}))).toBe(false);
  });
});

describe("syncPush", () => {
  // base64url "AQID" is the bytes 1, 2, 3
  const KEY = "AQID";
  const subscription = (serverKey: number[]) => ({
    endpoint: "https://push.example/abc",
    options: { applicationServerKey: new Uint8Array(serverKey).buffer },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => ({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "P", auth: "A" },
    }),
  });
  let existing: ReturnType<typeof subscription> | null;
  const subscribe = vi.fn();
  const register = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_CONVEX_URL", "https://x.convex.cloud");
    existing = null;
    m.query.mockReset().mockResolvedValue(KEY);
    m.mutation.mockReset().mockResolvedValue({ ok: true });
    subscribe
      .mockReset()
      .mockImplementation(async () => subscription([1, 2, 3]));
    register.mockReset().mockResolvedValue({
      pushManager: { getSubscription: async () => existing, subscribe },
    });
    vi.stubGlobal("Notification", { permission: "granted" });
    vi.stubGlobal("PushManager", class {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register, ready: Promise.resolve({ pushManager: {} }) },
    });
    register.mockImplementation(async () => {
      const reg = {
        pushManager: { getSubscription: async () => existing, subscribe },
      };
      (navigator.serviceWorker as unknown as { ready: unknown }).ready =
        Promise.resolve(reg);
      return reg;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("re-subscribes when the VAPID key changed and upserts the new subscription", async () => {
    existing = subscription([9, 9, 9]);
    const old = existing;
    await syncPush("tok");
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(m.mutation).toHaveBeenCalledTimes(1);
    expect(m.mutation.mock.calls[0]?.[1]).toEqual({
      sessionToken: "tok",
      endpoint: "https://push.example/abc",
      p256dh: "P",
      auth: "A",
    });
  });

  it("subscribes when there is none", async () => {
    await syncPush("tok");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(m.mutation).toHaveBeenCalledTimes(1);
  });

  it("keeps a subscription whose key still matches, and still upserts it", async () => {
    existing = subscription([1, 2, 3]);
    await syncPush("tok");
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(m.mutation).toHaveBeenCalledTimes(1);
  });

  it("does nothing unless permission is already granted", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    await syncPush("tok");
    expect(register).not.toHaveBeenCalled();
    expect(m.mutation).not.toHaveBeenCalled();
  });

  it("does nothing when the server has no key, and never throws", async () => {
    m.query.mockResolvedValue(null);
    await syncPush("tok");
    expect(m.mutation).not.toHaveBeenCalled();
    m.query.mockRejectedValue(new Error("offline"));
    await expect(syncPush("tok")).resolves.toBeUndefined();
  });

  describe("turning notifications off on this device", () => {
    const getRegistration = vi.fn();

    beforeEach(() => {
      localStorage.clear();
      getRegistration.mockReset().mockImplementation(async () => ({
        pushManager: { getSubscription: async () => existing, subscribe },
      }));
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register,
          getRegistration,
          ready: Promise.resolve({
            pushManager: { getSubscription: async () => existing, subscribe },
          }),
        },
      });
    });

    it("reads this browser's current endpoint, or null", async () => {
      expect(await currentEndpoint()).toBeNull();
      existing = subscription([1, 2, 3]);
      expect(await currentEndpoint()).toBe("https://push.example/abc");
      getRegistration.mockResolvedValue(undefined);
      expect(await currentEndpoint()).toBeNull();
    });

    it("drops the subscription and returns its endpoint", async () => {
      existing = subscription([1, 2, 3]);
      const sub = existing;
      expect(await dropSubscription()).toBe("https://push.example/abc");
      expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
      expect(await dropSubscription()).toBe("https://push.example/abc");
    });

    it("returns null when there was nothing to drop", async () => {
      expect(await dropSubscription()).toBeNull();
    });

    it("keeps syncPush from quietly turning it back on", async () => {
      existing = subscription([1, 2, 3]);
      await dropSubscription();
      existing = null;
      await syncPush("tok");
      expect(subscribe).not.toHaveBeenCalled();
      expect(m.mutation).not.toHaveBeenCalled();
    });

    it("enabling again lifts that, and syncPush resumes", async () => {
      existing = subscription([1, 2, 3]);
      await dropSubscription();
      existing = null;
      vi.stubGlobal("Notification", {
        permission: "granted",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      });
      expect(await enablePush("tok")).toBe("granted");
      await syncPush("tok");
      expect(m.mutation).toHaveBeenCalledTimes(2);
    });

    it("pushBlocked is true only when permission is denied", () => {
      vi.stubGlobal("Notification", { permission: "denied" });
      expect(pushBlocked()).toBe(true);
      vi.stubGlobal("Notification", { permission: "default" });
      expect(pushBlocked()).toBe(false);
    });
  });
});
