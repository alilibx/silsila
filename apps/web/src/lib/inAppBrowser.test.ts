import { describe, expect, it } from "vitest";
import { androidIntentUrl, inAppBrowser } from "./inAppBrowser";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const nav = (userAgent: string, standalone = false) => ({
  userAgent,
  maxTouchPoints: /iPhone|Android/.test(userAgent) ? 5 : 0,
  standalone,
});

describe("inAppBrowser", () => {
  it("finds an app's own browser on iPhone and Android", () => {
    expect(inAppBrowser(nav(IOS_WEBVIEW))).toBe("ios");
    expect(inAppBrowser(nav(`${IOS_SAFARI} WhatsApp/24.1`))).toBe("ios");
    expect(inAppBrowser(nav(ANDROID_WEBVIEW))).toBe("android");
    expect(inAppBrowser(nav(`${ANDROID_CHROME} WhatsApp/2.24`))).toBe(
      "android",
    );
    expect(inAppBrowser(nav(`${IOS_SAFARI} [FBAN/FBIOS;FBAV/450]`))).toBe(
      "ios",
    );
    expect(inAppBrowser(nav(`${ANDROID_CHROME} Instagram 300.0`))).toBe(
      "android",
    );
  });

  it("leaves real browsers and the home-screen app alone", () => {
    expect(inAppBrowser(nav(IOS_SAFARI))).toBeNull();
    expect(inAppBrowser(nav(IOS_CHROME))).toBeNull();
    expect(inAppBrowser(nav(ANDROID_CHROME))).toBeNull();
    expect(inAppBrowser(nav(DESKTOP))).toBeNull();
    // the iOS home-screen app has no "Safari/" either
    expect(inAppBrowser(nav(IOS_WEBVIEW, true))).toBeNull();
  });
});

describe("androidIntentUrl", () => {
  it("hands the same page to the phone's browser", () => {
    expect(androidIntentUrl("https://stg.wirdak.app/j/AbC-12_x?from=wa")).toBe(
      "intent://stg.wirdak.app/j/AbC-12_x?from=wa#Intent;scheme=https;end",
    );
  });
});
