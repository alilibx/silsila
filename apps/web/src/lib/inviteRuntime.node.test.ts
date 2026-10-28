// Vercel's Node runtime compiles api/invite.ts file by file and runs it as
// plain ESM: no bundler, no Vite aliases, no added file extensions. This test
// does the same (transpile only, same relative layout, a temp dir outside the
// repo) and imports the result with Node, so a bad import fails here and not
// on the first deploy.
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { afterAll, expect, it } from "vitest";

// import.meta.url is not a file: URL under jsdom, so use dirname.
const repo = resolve(import.meta.dirname, "../../../..");
const entry = join(repo, "apps/web/api/invite.ts");
const out = mkdtempSync(join(tmpdir(), "wirdak-invite-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

/** Transpiles `file` and, recursively, every module it imports. Returns the sources reached. */
function transpileClosure(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const dest = join(out, relative(repo, file)).replace(/\.ts$/, ".js");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, outputText);
  for (const { fileName: spec } of ts.preProcessFile(outputText, true, false)
    .importedFiles) {
    // Anything that is not an explicit relative `.js` path would fail in Node.
    expect(spec, `${relative(repo, file)} imports "${spec}"`).toMatch(
      /^\.\.?\/.*\.js$/,
    );
    transpileClosure(
      resolve(dirname(file), spec.replace(/\.js$/, ".ts")),
      seen,
    );
  }
  return seen;
}

it("loads in plain Node with a closure of just og.ts and digits.ts", () => {
  const closure = transpileClosure(entry);
  expect([...closure].map((f) => relative(repo, f)).sort()).toEqual([
    "apps/web/api/invite.ts",
    "apps/web/src/lib/og.ts",
    "convex/lib/digits.ts",
  ]);
  writeFileSync(join(out, "package.json"), '{"type":"module"}');
  const printed = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import(${JSON.stringify(join(out, "apps/web/api/invite.js"))}).then((m) => console.log(typeof m.default.fetch))`,
    ],
    { encoding: "utf8" },
  );
  expect(printed.trim()).toBe("function");
});
