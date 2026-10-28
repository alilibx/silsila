import { convexTest, type TestConvexForDataModel } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const NOW = 1_800_000_000_000;
const SECRET = "preview-secret";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("PREVIEW_SECRET", SECRET);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type T = TestConvexForDataModel<DataModel>;

let seq = 0;

async function signedIn(t: T, displayName: string) {
  seq += 1;
  const token = `token-${seq}`;
  const tokenHash = await sha256Hex(token);
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("people", {
      phone: `+9715000001${String(seq).padStart(2, "0")}`,
      displayName,
      verifiedAt: 0,
      timeZone: "Asia/Dubai",
      lastSeenAt: NOW,
    });
    await ctx.db.insert("sessions", {
      personId: id,
      tokenHash,
      alertTokenHash: `alert-${seq}`,
      deviceLabel: "test",
      createdAt: NOW,
      lastUsedAt: NOW,
    });
    return id;
  });
  return { personId, token };
}

async function setup(t: T, name: string | null = "ختمة العائلة") {
  const ali = await signedIn(t, "أحمد");
  const { inviteCode } = await t.action(api.khatmas.create, {
    sessionToken: ali.token,
    name,
    schedule: "weekly",
  });
  const khatma = await t.run(async (ctx) => {
    const k = await ctx.db
      .query("khatmas")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", inviteCode))
      .unique();
    if (!k) throw new Error("no khatma");
    return k;
  });
  const member = await t.run(async (ctx) => {
    const m = await ctx.db
      .query("members")
      .withIndex("by_khatma_person", (q) =>
        q.eq("khatmaId", khatma._id).eq("personId", ali.personId),
      )
      .unique();
    if (!m) throw new Error("no member");
    return m;
  });
  return { ali, inviteCode, khatma, member };
}

async function finishJuz(
  t: T,
  khatmaId: Id<"khatmas">,
  who: { personId: Id<"people"> },
  memberId: Id<"members">,
  juz: number,
) {
  await t.run(async (ctx) => {
    const khatma = await ctx.db.get(khatmaId);
    const round = khatma?.currentRoundId
      ? await ctx.db.get(khatma.currentRoundId)
      : null;
    if (!round) throw new Error("no round");
    await ctx.db.insert("assignments", {
      khatmaId,
      roundId: round._id,
      roundNumber: round.number,
      juz,
      memberId,
      personId: who.personId,
      takenAt: NOW,
      finishedAt: NOW,
      releasedAt: null,
      releasedBySystem: false,
      graceWakingMs: 0,
      noticeAt: NOW,
      graceEndsAt: NOW,
      extended: false,
      noticeSentAt: null,
      openedForHelpAt: null,
      remindedAt: null,
    });
  });
}

function get(
  t: T,
  params: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const qs = new URLSearchParams(params).toString();
  return t.fetch(`/api/preview?${qs}`, {
    headers: {
      "X-Preview-Secret": SECRET,
      "X-Visitor-Ip": "203.0.113.5",
      ...headers,
    },
  });
}

test("lookup returns name, progress, round and a validated inviter", async () => {
  const t = convexTest(schema, modules);
  const { ali, inviteCode, khatma, member } = await setup(t);
  for (const juz of [1, 2, 3]) {
    await finishJuz(t, khatma._id, ali, member._id, juz);
  }
  const out = await t.query(internal.preview.lookup, {
    inviteCode,
    from: member.shareToken ?? null,
  });
  expect(out).toEqual({
    name: "ختمة العائلة",
    createdAt: NOW,
    done: 3,
    round: 1,
    inviterName: "أحمد",
  });
});

test("inviter only for a valid token of an active member", async () => {
  const t = convexTest(schema, modules);
  const { inviteCode, khatma, member } = await setup(t);
  const other = await setup(t, "أخرى");
  const token = member.shareToken!;
  const names = async (from: string | null) =>
    (await t.query(internal.preview.lookup, { inviteCode, from }))?.inviterName;
  expect(await names(token)).toBe("أحمد");
  expect(await names(null)).toBeNull();
  expect(await names("not-a-token")).toBeNull();
  expect(await names("AAAAAAAAAAA")).toBeNull();
  // another khatma's token never names an inviter here
  expect(await names(other.member.shareToken!)).toBeNull();
  // a blocked member's token is dead
  await t.run((ctx) => ctx.db.patch(member._id, { status: "blocked" }));
  expect(await names(token)).toBeNull();
  expect(khatma._id).toBeDefined();
});

test("lookup is null for unknown, malformed, or roundless codes", async () => {
  const t = convexTest(schema, modules);
  const { inviteCode, khatma } = await setup(t);
  for (const code of ["zzz", "", "AAAAAAAAAAAA", "ا".repeat(12)]) {
    expect(
      await t.query(internal.preview.lookup, { inviteCode: code, from: null }),
    ).toBeNull();
  }
  await t.run((ctx) => ctx.db.patch(khatma._id, { currentRoundId: undefined }));
  expect(
    await t.query(internal.preview.lookup, { inviteCode, from: null }),
  ).toBeNull();
});

test("preview endpoint: 401 without or with a wrong secret", async () => {
  const t = convexTest(schema, modules);
  const { inviteCode } = await setup(t);
  const url = `/api/preview?code=${inviteCode}`;
  expect((await t.fetch(url)).status).toBe(401);
  expect(
    (await t.fetch(url, { headers: { "X-Preview-Secret": "nope" } })).status,
  ).toBe(401);
  vi.stubEnv("PREVIEW_SECRET", "");
  expect(
    (await t.fetch(url, { headers: { "X-Preview-Secret": "" } })).status,
  ).toBe(401);
});

test("preview endpoint: 200 with the lookup, 404 for unknown codes", async () => {
  const t = convexTest(schema, modules);
  const { inviteCode, member } = await setup(t);
  const ok = await get(t, { code: inviteCode, from: member.shareToken! });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({
    name: "ختمة العائلة",
    createdAt: NOW,
    done: 0,
    round: 1,
    inviterName: "أحمد",
  });
  const noFrom = await get(t, { code: inviteCode });
  expect((await noFrom.json()).inviterName).toBeNull();
  expect((await get(t, { code: "AAAAAAAAAAAA" })).status).toBe(404);
  expect((await get(t, {})).status).toBe(404);
});

test("preview endpoint: 429 over the per-IP limit, per visitor", async () => {
  const t = convexTest(schema, modules);
  const { inviteCode } = await setup(t);
  for (let i = 0; i < 30; i++) {
    expect((await get(t, { code: inviteCode })).status).toBe(200);
  }
  expect((await get(t, { code: inviteCode })).status).toBe(429);
  // another visitor is unaffected
  const other = await get(
    t,
    { code: inviteCode },
    { "X-Visitor-Ip": "198.51.100.1" },
  );
  expect(other.status).toBe(200);
  // the window rolls over
  vi.setSystemTime(NOW + 61_000);
  expect((await get(t, { code: inviteCode })).status).toBe(200);
});
