import { describe, expect, test } from "bun:test";
import { git, repo, run, write } from "./helpers";

describe("silence check", () => {
  test("is silent and exits 0 when nothing changed", () => {
    const dir = repo({ "a.ts": "// TODO: legacy\nf();\n" });
    expect(run(dir, ["check"])).toMatchObject({ code: 0, out: "" });
  });

  test("reports only comments added since HEAD, including untracked files", () => {
    const dir = repo({ "a.ts": "// TODO: legacy\nf();\n" });
    write(dir, { "a.ts": "// TODO: legacy\nf();\n// TODO: fresh\ng();\n", "b.ts": "// done ✅\nh();\n" });
    const r = run(dir, ["check"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("a.ts:3:1");
    expect(r.out).not.toContain("a.ts:1:1");
    expect(r.out).toContain("b.ts:1:1");
    expect(r.out).toContain("2 errors");
  });

  test("--staged reads the index, not the working tree", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// TODO: staged\nf();\n" });
    git(dir, "add", "a.ts");
    write(dir, { "a.ts": "// TODO: remove once v2 ships\nf();\n" });
    expect(run(dir, ["check", "--staged"]).code).toBe(1);
    expect(run(dir, ["check"]).code).toBe(0);
  });

  test("--base compares the branch with its merge base", () => {
    const dir = repo({ "a.ts": "f();\n" });
    git(dir, "checkout", "-qb", "feature");
    write(dir, { "a.ts": "// ---- Helpers ----\nf();\n" });
    git(dir, "commit", "-qam", "banner");
    const r = run(dir, ["check", "--base", "main"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("banner");
  });

  test("--all checks every line of the named paths", () => {
    const dir = repo({ "src/a.ts": "// TODO: legacy\nf();\n", "other/b.ts": "// TODO: x\n" });
    const r = run(dir, ["check", "--all", "src"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/a.ts:1:1");
    expect(r.out).not.toContain("other/b.ts");
  });

  test("warnings alone pass unless --strict", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// get the user\nconst user = getUser();\n" });
    expect(run(dir, ["check"]).code).toBe(0);
    expect(run(dir, ["check", "--strict"]).code).toBe(1);
  });

  test("reads silence.json from the repository root", () => {
    const dir = repo({ "silence.json": JSON.stringify({ references: ["\\bC-\\d+\\b"] }), "a.ts": "f();\n" });
    write(dir, { "a.ts": "// per C-04\nf();\n" });
    expect(run(dir, ["check"]).out).toContain("references");
  });

  test("github format emits workflow annotations", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// TODO: x\nf();\n" });
    expect(run(dir, ["check", "--format", "github"]).out).toContain("::error file=a.ts,line=1,col=1,title=silence/todo::");
  });

  test("json format is machine readable", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// TODO: x\nf();\n" });
    const [f] = JSON.parse(run(dir, ["check", "--format", "json"]).out);
    expect(f).toMatchObject({ path: "a.ts", line: 1, rule: "todo", severity: "error" });
  });

  test("an unknown option is a usage error", () => {
    expect(run(repo(), ["check", "--nope"]).code).toBe(2);
  });
});

describe("silence hook claude", () => {
  const event = (dir: string, tool: string, input: Record<string, unknown>) =>
    JSON.stringify({ hook_event_name: "PostToolUse", cwd: dir, tool_name: tool, tool_input: input });

  test("feeds findings in the written text back to the agent with exit 2", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// TODO: later\nf();\n" });
    const r = run(dir, ["hook", "claude"], event(dir, "Write", { file_path: `${dir}/a.ts`, content: "// TODO: later\nf();\n" }));
    expect(r.code).toBe(2);
    expect(r.err).toContain("todo");
    expect(r.err).toContain("silence-allow");
  });

  test("ignores findings the edit did not write", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// TODO: earlier\nf();\ng();\n" });
    const r = run(dir, ["hook", "claude"], event(dir, "Edit", { file_path: `${dir}/a.ts`, old_string: "f();", new_string: "f();\ng();" }));
    expect(r).toMatchObject({ code: 0, err: "" });
  });

  test("reads every new_string of a MultiEdit", () => {
    const dir = repo({ "a.ts": "f();\n" });
    write(dir, { "a.ts": "// done ✅\nf();\n" });
    const edits = [{ old_string: "x", new_string: "y" }, { old_string: "f();", new_string: "// done ✅\nf();" }];
    expect(run(dir, ["hook", "claude"], event(dir, "MultiEdit", { file_path: `${dir}/a.ts`, edits })).code).toBe(2);
  });

  test("passes through other tools and unsupported files", () => {
    const dir = repo();
    expect(run(dir, ["hook", "claude"], event(dir, "Bash", { command: "ls" })).code).toBe(0);
    write(dir, { "a.png": "x" });
    expect(run(dir, ["hook", "claude"], event(dir, "Write", { file_path: `${dir}/a.png`, content: "x" })).code).toBe(0);
  });

  test("never blocks on malformed input", () => {
    expect(run(repo(), ["hook", "claude"], "not json").code).toBe(0);
  });
});
