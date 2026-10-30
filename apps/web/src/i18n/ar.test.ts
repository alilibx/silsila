import { DUAS } from "@convex/lib/duas";
import { SCHEDULES } from "@convex/lib/schedule";
import { describe, expect, it } from "vitest";
import { t } from "./ar";

describe("schedule labels", () => {
  it("are exactly the six agreed labels, in order", () => {
    expect(SCHEDULES.map((s) => t.schedules[s])).toEqual([
      "يومية",
      "كل ٣ أيام",
      "أسبوعية",
      "كل أسبوعين",
      "شهرية",
      "بدون موعد",
    ]);
  });
});

describe("separators next to numbers", () => {
  // "·" beside Eastern Arabic digits reads as the digit zero (٠).
  it("never put a middle dot beside a number", () => {
    expect(t.home.yours("١٤", "ربما")).toBe("جزؤك: الجزء ١٤ «ربما»");
    expect(t.celebration.subtitle("ختمة العائلة", "١٢")).toBe(
      "الحمد لله، ختمة العائلة، الختمة ١٢",
    );
  });
});

describe("celebration duas", () => {
  it("are the same ones the WhatsApp dua text sends", () => {
    expect(t.celebration.duas).toBe(DUAS);
  });
});

describe("the rota join link's share message", () => {
  it("says how often the khatma is read", () => {
    const link = "https://wa.me/971500000000?text=x";
    const said = (days: "daily" | "weekly" | "biweekly" | "monthly") =>
      t.rota.shareMessage("ختمة العائلة", link, days);
    expect(said("daily")).toBe(
      `السلام عليكم، بدأنا ختمة العائلة، ختمة يومية بالتناوب. اضغطوا الرابط وأرسلوا الرسالة كما هي: ${link}`,
    );
    expect(said("weekly")).toContain("، ختمة أسبوعية بالتناوب.");
    expect(said("biweekly")).toContain("، ختمة كل أسبوعين بالتناوب.");
    expect(said("monthly")).toContain("، ختمة شهرية بالتناوب.");
  });
});
