/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admins from "../admins.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as grace from "../grace.js";
import type * as handoff from "../handoff.js";
import type * as hooks from "../hooks.js";
import type * as http from "../http.js";
import type * as khatmas from "../khatmas.js";
import type * as lib_adminSession from "../lib/adminSession.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_digits from "../lib/digits.js";
import type * as lib_grace from "../lib/grace.js";
import type * as lib_juz from "../lib/juz.js";
import type * as lib_khatma from "../lib/khatma.js";
import type * as lib_noteText from "../lib/noteText.js";
import type * as lib_pace from "../lib/pace.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_wakingTime from "../lib/wakingTime.js";
import type * as maintenance from "../maintenance.js";
import type * as notes from "../notes.js";
import type * as nudges from "../nudges.js";
import type * as organizer from "../organizer.js";
import type * as people from "../people.js";
import type * as pool from "../pool.js";
import type * as preview from "../preview.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as rounds from "../rounds.js";
import type * as sessions from "../sessions.js";
import type * as verification from "../verification.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admins: typeof admins;
  crons: typeof crons;
  dev: typeof dev;
  grace: typeof grace;
  handoff: typeof handoff;
  hooks: typeof hooks;
  http: typeof http;
  khatmas: typeof khatmas;
  "lib/adminSession": typeof lib_adminSession;
  "lib/audit": typeof lib_audit;
  "lib/crypto": typeof lib_crypto;
  "lib/digits": typeof lib_digits;
  "lib/grace": typeof lib_grace;
  "lib/juz": typeof lib_juz;
  "lib/khatma": typeof lib_khatma;
  "lib/noteText": typeof lib_noteText;
  "lib/pace": typeof lib_pace;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/schedule": typeof lib_schedule;
  "lib/session": typeof lib_session;
  "lib/settings": typeof lib_settings;
  "lib/text": typeof lib_text;
  "lib/wakingTime": typeof lib_wakingTime;
  maintenance: typeof maintenance;
  notes: typeof notes;
  nudges: typeof nudges;
  organizer: typeof organizer;
  people: typeof people;
  pool: typeof pool;
  preview: typeof preview;
  push: typeof push;
  pushNode: typeof pushNode;
  rounds: typeof rounds;
  sessions: typeof sessions;
  verification: typeof verification;
  whatsapp: typeof whatsapp;
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
