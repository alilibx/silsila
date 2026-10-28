import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const config = JSON.parse(
  readFileSync(join(__dirname, "..", "vercel.json"), "utf8"),
) as {
  redirects?: { source: string; destination: string; permanent: boolean }[];
};

// WhatsApp template buttons are fixed to https://wirdak.app/{{1}}, and staging sends stg/j/<code>.
it("sends wirdak.app/stg/* to staging, temporarily", () => {
  expect(config.redirects).toContainEqual({
    source: "/stg/:path*",
    destination: "https://stg.wirdak.app/:path*",
    permanent: false,
  });
});
