import { describe, expect, test } from "bun:test";
import { extractComments, languageOf } from "../src/extract";

const bodies = async (path: string, src: string) => (await extractComments(path, src))!.map((c) => c.body);

describe("languageOf", () => {
  test.each([
    ["a.ts", "typescript"],
    ["a.tsx", "tsx"],
    ["a.js", "tsx"],
    ["a.mjs", "tsx"],
    ["A.cs", "c_sharp"],
    ["a.dart", "dart"],
    ["a.sh", "bash"],
    ["a.yml", "yaml"],
    ["a.yaml", "yaml"],
    ["a.sql", "sql"],
  ])("%s is %s", (path, lang) => expect(languageOf(path)).toBe(lang as never));

  test("unknown extensions are unsupported", () => expect(languageOf("a.png")).toBeNull());
});

describe("extractComments", () => {
  test("ignores comment markers inside strings", async () => {
    expect(await bodies("a.ts", 'const s = "// not a comment"; // real\n')).toEqual(["real"]);
    expect(await bodies("A.cs", 'var s = @"/* no */"; /* yes */\n')).toEqual(["yes"]);
    expect(await bodies("a.dart", "var s = r'// no'; // yes\n")).toEqual(["yes"]);
    expect(await bodies("a.sh", 'echo "# no" # yes\n')).toEqual(["yes"]);
  });

  test("merges consecutive whole-line comments into one block", async () => {
    const [c] = (await extractComments("a.ts", "// one\n// two\nconst x = 1;\n"))!;
    expect(c).toMatchObject({ line: 1, endLine: 2, body: "one\ntwo", next: "const x = 1;" });
  });

  test("does not merge a trailing comment with the line comment below it", async () => {
    expect(await bodies("a.ts", "f(); // a\n// b\ng();\n")).toEqual(["a", "b"]);
  });

  test("marks doc comments", async () => {
    const docs = async (path: string, src: string) => (await extractComments(path, src))!.map((c) => c.doc);
    expect(await docs("a.ts", "/** doc */\nfunction f() {}\n// plain\n")).toEqual([true, false]);
    expect(await docs("a.dart", "/// doc\nvoid f() {}\n")).toEqual([true]);
    expect(await docs("A.cs", "/// <summary>x</summary>\nclass A {}\n")).toEqual([true]);
  });

  test("marks trailing comments and records the next code line", async () => {
    const [c] = (await extractComments("a.ts", "let a = 1; // why\nlet b = 2;\n"))!;
    expect(c).toMatchObject({ trailing: true, next: "let a = 1;" });
  });

  test("strips block markers and leading stars", async () => {
    expect(await bodies("a.ts", "/*\n * first\n * second\n */\nf();\n")).toEqual(["first\nsecond"]);
  });

  test("recognises tool directives", async () => {
    const cs = (await extractComments("a.ts", "// eslint-disable-next-line no-x\nf();\n// @ts-expect-error\ng();\n"))!;
    expect(cs.map((c) => c.directive)).toEqual([true, true]);
    const [shebang] = (await extractComments("a.sh", "#!/usr/bin/env bash\necho\n"))!;
    expect(shebang!.directive).toBe(true);
  });

  test("collects silence-allow lines out of the block body", async () => {
    const [c] = (await extractComments("a.ts", "// silence-allow narration: mirrors the vendor name\n// get user\ngetUser();\n"))!;
    expect(c).toMatchObject({ body: "get user", allows: [{ rules: ["narration"], reason: "mirrors the vendor name" }] });
  });

  test.each([
    ["heredoc", "cat <<EOF\nhello # not a comment\nEOF\n# real\n"],
    ["quoted heredoc", "cat <<'EOF'\nx # no\nEOF\n# real\n"],
    ["expansions", 'echo "${a:-b}" ${#arr[@]} $((1 + 2)) # real\n'],
    ["a test with !=", 'if [ "$a" != "1" ]; then # real\n  echo\nfi\n'],
    ["regex test", "[[ $a =~ ^[0-9]+$ ]] && echo ok # real\n"],
  ])("bash: parses %s", async (_name, src) => {
    expect(await bodies("a.sh", src)).toEqual(["real"]);
  });

  test("yaml: skips quoted hashes and block scalars", async () => {
    const src = 'a: "x # no" # yes\nb: |\n  # inside scalar\n  text\n# top\nc: 1\n';
    expect(await bodies("a.yml", src)).toEqual(["yes", "top"]);
  });

  test("sql: line and block comments outside strings", async () => {
    expect(await bodies("a.sql", "select '-- no' -- yes\n/* blk */ from t;\n")).toEqual(["yes", "blk"]);
  });

  test("unsupported files yield null", async () => {
    expect(await extractComments("a.png", "")).toBeNull();
  });
});
