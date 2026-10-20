import { describe, expect, test } from "bun:test";
import { extractComments } from "../src/extract";
import { checkSource } from "../src/check";
import { resolveConfig } from "../src/config";

const shortcuts = resolveConfig({
  references: ["\\b(design|contracts|intent|decisions|slices)\\.md\\b", "\\b[CDSU]-?\\d+\\b"],
});

const rules = async (src: string, path = "a.ts", config = resolveConfig({})) =>
  (await checkSource(path, src, "all", config)).map((f) => `${f.rule}:${f.severity}`);

describe("references", () => {
  test("flags markdown documents by default", async () => {
    expect(await rules("// see README.md for details\nf();\n")).toEqual(["references:error"]);
  });

  test("flags configured record ids", async () => {
    expect(await rules("// per C-04 the total is rounded\nf();\n", "a.ts", shortcuts)).toEqual(["references:error"]);
    expect(await rules("// matches design.md\nf();\n", "a.ts", shortcuts)).toEqual(["references:error"]);
  });

  test("leaves ordinary prose alone", async () => {
    expect(await rules("// Stripe rejects amounts below 50 cents, so round up first.\nf();\n", "a.ts", shortcuts)).toEqual([]);
  });

  test("applies to doc comments too", async () => {
    expect(await rules("/** Implements C-04. */\nexport function f() {}\n", "a.ts", shortcuts)).toEqual(["references:error"]);
  });
});

describe("emoji", () => {
  test.each(["// done ✅", "// careful ⚠\uFE0F here", "// 🔴 failing"])("flags %s", async (line) =>
    expect(await rules(`${line}\nf();\n`)).toEqual(["emoji:error"]),
  );

  test.each(["// maps a ↔ b both ways", "// © 2026 Example Ltd", "// x → y"])("leaves typography alone: %s", async (line) =>
    expect(await rules(`${line}\nf();\n`)).toEqual([]),
  );
});

describe("banner", () => {
  test.each(["// ── Group 2b — Composite Service ──────", "// ━━━━ Setup ━━━━", "// ════════",
    "// ---- Helpers ----", "// ==========", "// #region setup", "// MARK: - Lifecycle", "/* ******** */"])(
    "%s",
    async (line) => expect(await rules(`${line}\nf();\n`)).toEqual(["banner:error"]),
  );

  test("a banner is not also reported as narration", async () => {
    expect(await rules("// ---- save order ----\nsaveOrder(order);\n")).toEqual(["banner:error"]);
  });

  test("a single dash is not a banner", async () => expect(await rules("// retries - with backoff - because the API throttles\nf();\n")).toEqual([]));
});

describe("todo", () => {
  test("flags a TODO with no removal condition", async () => {
    expect(await rules("// TODO: clean this up\nf();\n")).toEqual(["todo:error"]);
  });

  test.each([
    "// TODO: remove once the v2 endpoint is live",
    "// FIXME: drop the retry when the SDK fixes https://github.com/x/y/issues/1",
    "// HACK: until Safari supports :has, fall back to JS",
  ])("accepts %s", async (line) => expect(await rules(`${line}\nf();\n`)).toEqual([]));
});

describe("speculative", () => {
  test.each(["// this should work", "// hopefully fine", "// handles all cases", "// not sure why but needed"])(
    "%s",
    async (line) => expect(await rules(`${line}\nf();\n`)).toEqual(["speculative:warning"]),
  );
});

describe("narration", () => {
  test.each([
    ["// get the user", "const user = await repo.getUser(id);"],
    ["// Loop over items", "for (const item of items) {}"],
    ["// return the total", "return total;"],
    ["// increment counter", "counter++;"],
  ])("%s above %s", async (comment, code) => {
    expect(await rules(`${comment}\n${code}\n`)).toEqual(["narration:warning"]);
  });

  test("a comment giving a reason is not narration", async () => {
    expect(await rules("// get the user first because the lock needs its id\nconst user = await repo.getUser(id);\n")).toEqual([]);
  });

  test("a comment adding words the code lacks is not narration", async () => {
    expect(await rules("// Stripe settles in cents\nconst total = amount * 100;\n")).toEqual([]);
  });

  test("doc comments are exempt", async () => {
    expect(await rules("/** Gets the user. */\nexport function getUser() {}\n")).toEqual([]);
  });

  test("works in dart and c#", async () => {
    expect(await rules("void f() {\n  // save the order\n  saveOrder(order);\n}\n", "a.dart")).toEqual(["narration:warning"]);
    expect(await rules("class A { void F() {\n  // save the order\n  SaveOrder(order);\n} }\n", "A.cs")).toEqual(["narration:warning"]);
  });
});

describe("directives and allows", () => {
  test("directives are never flagged", async () => {
    expect(await rules("// eslint-disable-next-line no-console -- see README.md\nconsole.log(1);\n")).toEqual([]);
  });

  test("silence-allow with a reason suppresses the named rule", async () => {
    expect(await rules("// silence-allow narration: name mirrors the vendor spec\n// get user\ngetUser();\n")).toEqual([]);
  });

  test("silence-allow only suppresses the rules it names", async () => {
    expect(await rules("// silence-allow emoji: brand glyph\n// get user\ngetUser();\n")).toEqual(["narration:warning"]);
  });

  test("silence-allow on the line above a block comment applies to it", async () => {
    expect(await rules("// silence-allow todo: tracked externally\n/* TODO: tidy */\nf();\n")).toEqual([]);
  });

  test("silence-allow without a reason is an error and suppresses nothing", async () => {
    expect(await rules("// silence-allow narration\n// get user\ngetUser();\n")).toEqual(["allow-reason:error", "narration:warning"]);
  });
});

describe("configuration", () => {
  test("a rule can be switched off or re-graded", async () => {
    const off = resolveConfig({ rules: { narration: "off" } });
    expect(await rules("// get the user\nconst user = getUser();\n", "a.ts", off)).toEqual([]);
    const strict = resolveConfig({ rules: { narration: "error" } });
    expect(await rules("// get the user\nconst user = getUser();\n", "a.ts", strict)).toEqual(["narration:error"]);
  });

  test("ignored paths produce nothing", async () => {
    const config = resolveConfig({ ignore: ["**/*.g.dart"] });
    expect(await checkSource("lib/a.g.dart", "// TODO: x\nf();\n", "all", config)).toEqual([]);
  });

  test("generated files are ignored by default", async () => {
    expect(await checkSource("lib/a.freezed.dart", "// TODO: x\nf();\n", "all", resolveConfig({}))).toEqual([]);
  });
});

describe("diff scoping", () => {
  test("only comments touching added lines are checked", async () => {
    const src = "// TODO: old\nf();\n// TODO: new\ng();\n";
    const found = await checkSource("a.ts", src, new Set([3]), resolveConfig({}));
    expect(found.map((f) => f.line)).toEqual([3]);
  });

  test("an edit to any line of a block re-checks the whole block", async () => {
    const src = "// TODO: one\n// two\nf();\n";
    expect((await checkSource("a.ts", src, new Set([2]), resolveConfig({}))).map((f) => f.rule)).toEqual(["todo"]);
  });

  test("extractComments is exported for tooling", async () => expect(typeof extractComments).toBe("function"));
});
