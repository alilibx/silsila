/**
 * Writes the README logo, docs/assets/logo.svg and logo-dark.svg: the misbaha mark from
 * scripts/images/icon.html beside وِردك and "Wirdak", with the words outlined to paths so
 * GitHub needs no font.
 *
 *   bun run tsx scripts/render-logo.ts <ArefRuqaa-Bold.ttf> <ReadexPro[HEXP,wght].ttf>
 *
 * Needs HarfBuzz's hb-view (`brew install harfbuzz`). Both fonts are on Google Fonts
 * (github.com/google/fonts, ofl/arefruqaa and ofl/readexpro).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [arabicFont, latinFont] = process.argv.slice(2);
if (!arabicFont || !latinFont) {
  throw new Error("usage: render-logo.ts <ArefRuqaa-Bold.ttf> <ReadexPro.ttf>");
}

const outDir = new URL("../docs/assets/", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "wirdak-logo-"));

/** Shapes `text` with hb-view at 100px and returns its SVG. */
function shape(font: string, text: string, variations?: string): string {
  const textFile = join(work, "text.txt");
  const out = join(work, "out.svg");
  // hb-view reads the text as UTF-8 from a file; on the command line it depends on the locale.
  writeFileSync(textFile, text);
  const args = [font, `--text-file=${textFile}`, "--output-format=svg"];
  args.push("--font-size=100", "--margin=0", `--output-file=${out}`);
  if (variations) args.push(`--variations=${variations}`);
  execFileSync("hb-view", args);
  return readFileSync(out, "utf8");
}

/** Flattens an hb-view SVG into plain paths, scaled by `s` and moved to (dx, dy). */
function flatten(svg: string, s: number, dx: number, dy: number): string {
  const glyphs = new Map<string, string>();
  for (const m of svg.matchAll(/<g id="([^"]+)">\s*<path d="([^"]*)"/g)) {
    glyphs.set(m[1]!, m[2]!.replace(/\s+/g, " ").trim());
  }
  const paths: string[] = [];
  const uses = /<use xlink:href="#([^"]+)" x="([^"]+)" y="([^"]+)"\/>/g;
  for (const m of svg.matchAll(uses)) {
    const d = glyphs.get(m[1]!);
    if (!d) continue; // an empty glyph
    const x = (dx + s * Number(m[2])).toFixed(2);
    const y = (dy + s * Number(m[3])).toFixed(2);
    paths.push(`<path transform="translate(${x} ${y}) scale(${s})" d="${d}"/>`);
  }
  return paths.join("\n    ");
}

/** The ring from icon.html (30 beads, saffron every tenth, the tassel) in its 512 box. */
function mark(
  s: number,
  dx: number,
  dy: number,
  green: string,
  saffron: string,
) {
  const R = 130;
  const r = 13;
  const cx = 256;
  const cy = 231;
  const at = (x: number, y: number) => [
    (dx + s * x).toFixed(1),
    (dy + s * y).toFixed(1),
  ];
  const out: string[] = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * 2 * Math.PI;
    const [x, y] = at(cx + R * Math.sin(a), cy - R * Math.cos(a));
    const fill = i % 10 === 0 ? saffron : green;
    out.push(
      `<circle cx="${x}" cy="${y}" r="${(s * r).toFixed(1)}" fill="${fill}"/>`,
    );
  }
  const [lx, ly1] = at(cx, cy + R + r);
  const [, ly2] = at(cx, cy + R + 29);
  const sw = (s * 4).toFixed(1);
  out.push(
    `<line x1="${lx}" y1="${ly1}" x2="${lx}" y2="${ly2}" stroke="${green}" stroke-width="${sw}"/>`,
  );
  const [tx, ty] = at(cx, cy + R + 46);
  out.push(
    `<circle cx="${tx}" cy="${ty}" r="${(s * 17).toFixed(1)}" fill="${saffron}"/>`,
  );
  return out.join("\n    ");
}

const arabic = shape(arabicFont, "وِردك");
const latin = shape(latinFont, "Wirdak", "wght=500");

const W = 336;
const H = 150;
// The mark spans y 88..424 and x 113..399 of the icon's box; scale it to 140 tall.
const ms = 140 / 336;
const textX = 4 + 286 * ms + 34;

const themes = {
  light: {
    green: "#1F5A45",
    saffron: "#C98A1E",
    word: "#1F5A45",
    latin: "#4E5B55",
  },
  // Lighter beads and paper-coloured words, readable on GitHub's dark background.
  dark: {
    green: "#4FA383",
    saffron: "#D9A93F",
    word: "#F5EFE3",
    latin: "#B9C7BF",
  },
};

for (const [theme, c] of Object.entries(themes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Wirdak · وِردك">
  <!-- Written by scripts/render-logo.ts: the misbaha mark from scripts/images/icon.html; وِردك in Aref Ruqaa Bold and Wirdak in Readex Pro Medium, outlined so it needs no font. -->
  <g>
    ${mark(ms, 4 - 113 * ms, 5 - 88 * ms, c.green, c.saffron)}
  </g>
  <g fill="${c.word}">
    ${flatten(arabic, 0.86, textX, -22)}
  </g>
  <g fill="${c.latin}">
    ${flatten(latin, 0.31, textX + 3, 102)}
  </g>
</svg>
`;
  const file = join(outDir, theme === "light" ? "logo.svg" : "logo-dark.svg");
  writeFileSync(file, svg);
  console.log(`-> ${file}`);
}
