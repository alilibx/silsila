import { SETTING_SPECS, type SettingGroup } from "@convex/lib/settingSpecs";
import { SETTING_DEFAULTS, type SettingKey } from "@convex/lib/settings";
import { describe, expect, it } from "vitest";
import { SETTING_LAYOUT } from "./settingLayout";

describe("SETTING_LAYOUT", () => {
  it("places every setting exactly once, in its own group", () => {
    const placed: SettingKey[] = [];
    for (const [group, sections] of Object.entries(SETTING_LAYOUT) as [
      SettingGroup,
      (typeof SETTING_LAYOUT)[SettingGroup],
    ][]) {
      for (const { keys } of sections) {
        for (const key of keys) {
          expect(SETTING_SPECS[key].group, key).toBe(group);
          placed.push(key);
        }
      }
    }
    expect([...placed].sort()).toEqual(Object.keys(SETTING_DEFAULTS).sort());
  });
});
