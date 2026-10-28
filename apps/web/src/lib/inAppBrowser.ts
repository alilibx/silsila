import { isIos } from "./push";

type Nav = Pick<Navigator, "userAgent" | "maxTouchPoints"> & {
  standalone?: boolean;
};

/** Apps that name themselves in their built-in browser's user agent. */
const APP_MARKERS = /WhatsApp|FBAN|FBAV|Instagram/i;

/**
 * Which phone's in-app browser this is (WhatsApp, Facebook, Instagram), or
 * null in a real browser. Those browsers keep their own storage, so a person
 * signed in in Safari or Chrome shows as signed out there. Besides the app
 * markers: an Android WebView says "; wv)", and an iOS web view has no
 * "Safari/" token (nor does the home-screen app, so that one is excluded).
 */
export function inAppBrowser(nav: Nav = navigator): "ios" | "android" | null {
  const ua = nav.userAgent;
  const ios = isIos(nav);
  const android = /Android/.test(ua);
  if (!ios && !android) return null;
  if (ios && nav.standalone === true) return null;
  const embedded =
    APP_MARKERS.test(ua) ||
    (android && /; wv\)/.test(ua)) ||
    (ios && /AppleWebKit/.test(ua) && !/Safari\//.test(ua));
  if (!embedded) return null;
  return ios ? "ios" : "android";
}

/** An Android intent link that opens `url` in the phone's own browser. */
export function androidIntentUrl(url: string): string {
  const { host, pathname, search } = new URL(url);
  return `intent://${host}${pathname}${search}#Intent;scheme=https;end`;
}
