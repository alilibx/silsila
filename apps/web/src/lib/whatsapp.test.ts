import { describe, expect, it } from "vitest";
import { waLink, waShareLink } from "./whatsapp";

describe("wa.me links", () => {
  it("builds the verification link with the text encoded", () => {
    expect(waLink("971500000000", "رمز التحقق في سلسلة: K7Q2-9XMB-4T")).toBe(
      "https://wa.me/971500000000?text=%D8%B1%D9%85%D8%B2%20%D8%A7%D9%84%D8%AA%D8%AD%D9%82%D9%82%20%D9%81%D9%8A%20%D8%B3%D9%84%D8%B3%D9%84%D8%A9%3A%20K7Q2-9XMB-4T",
    );
  });

  it("builds a share link with no recipient", () => {
    expect(waShareLink("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });
});
