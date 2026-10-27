/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_juz from "../lib/juz.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_text from "../lib/text.js";
import type * as maintenance from "../maintenance.js";
import type * as people from "../people.js";
import type * as sessions from "../sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "lib/crypto": typeof lib_crypto;
  "lib/juz": typeof lib_juz;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/schedule": typeof lib_schedule;
  "lib/session": typeof lib_session;
  "lib/settings": typeof lib_settings;
  "lib/text": typeof lib_text;
  maintenance: typeof maintenance;
  people: typeof people;
  sessions: typeof sessions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
