import { expect, test } from "vitest";
import { decodePayload, encodePayload } from "./rotaPayload";

const p = { action: "done", dayId: "d1abc", participantId: "p2xyz" } as const;

test("a payload round-trips, with the environment marker", () => {
  expect(encodePayload(p, false)).toBe("r1|p|done|d1abc|p2xyz");
  expect(encodePayload(p, true)).toBe("r1|s|done|d1abc|p2xyz");
  expect(decodePayload(encodePayload(p, false))).toEqual({
    ...p,
    staging: false,
  });
  expect(
    decodePayload(encodePayload({ ...p, action: "notYet" }, true)),
  ).toEqual({ ...p, action: "notYet", staging: true });
  expect(decodePayload(encodePayload({ ...p, action: "dua" }, true))).toEqual({
    ...p,
    action: "dua",
    staging: true,
  });
});

test("garbage decodes to null", () => {
  for (const s of [
    "",
    "hello",
    "r1|p|done|d1",
    "r1|p|done|d1|p1|extra",
    "r2|p|done|d1|p1",
    "r1|x|done|d1|p1",
    "r1|p|finish|d1|p1",
    "r1|p|done||p1",
    "r1|p|done|d1|",
  ]) {
    expect(decodePayload(s)).toBeNull();
  }
});
