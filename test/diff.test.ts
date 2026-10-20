import { expect, test } from "bun:test";
import { parseAddedLines, readSource } from "../src/diff";

test("collects added line numbers per file from a zero-context diff", () => {
  const diff = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -3,0 +4,2 @@",
    "+x",
    "+y",
    "@@ -10 +12 @@",
    "-old",
    "+new",
    "diff --git a/gone.ts b/gone.ts",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-bye",
    'diff --git "a/sp ace.ts" "b/sp ace.ts"',
    '--- "a/sp ace.ts"',
    '+++ "b/sp ace.ts"',
    "@@ -0,0 +1 @@",
    "+z",
  ].join("\n");
  const added = parseAddedLines(diff);
  expect([...added.keys()]).toEqual(["src/a.ts", "sp ace.ts"]);
  expect([...added.get("src/a.ts")!]).toEqual([4, 5, 12]);
  expect([...added.get("sp ace.ts")!]).toEqual([1]);
});

test("a pure deletion hunk adds nothing", () => {
  const added = parseAddedLines("+++ b/a.ts\n@@ -5,2 +4,0 @@\n-a\n-b\n");
  expect([...added.get("a.ts")!]).toEqual([]);
});

test("readSource skips paths that are not regular files", () => {
  const { mkdtempSync, mkdirSync } = require("node:fs");
  const dir = mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "silence-"));
  mkdirSync(`${dir}/sub`);
  expect(readSource(dir, "sub", { kind: "head" })).toBeNull();
});
