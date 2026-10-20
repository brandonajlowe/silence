#!/usr/bin/env bun
import { realpathSync } from "node:fs";
import { relative } from "node:path";
import { parseArgs } from "node:util";
import { checkSource, type Finding } from "./check";
import { loadConfig } from "./config";
import { changes, readSource, repoRoot, type Mode } from "./diff";
import { languageOf } from "./extract";
import { claudeHook } from "./hook";
import { render, type Format } from "./report";
import pkg from "../package.json";

const usage = `silence ${pkg.version}: lint the code comments you add, not the ones you inherited.

Usage:
  silence check [paths...] [--staged | --base <ref> | --all] [--format text|json|github] [--strict]
  silence hook claude

check
  Default     comments added since HEAD, plus untracked files
  --staged    comments added in the index (pre-commit)
  --base REF  comments added on this branch since its merge base with REF (CI)
  --all       every comment in the named paths, or the whole repository
  --strict    exit 1 on warnings as well as errors
  Exits 0 when clean, 1 on findings, 2 on a usage or git error.

hook claude
  Claude Code PostToolUse hook for Write|Edit|MultiEdit. Reports only comments the edit
  wrote, on stderr with exit 2, so the agent sees and fixes them. Never blocks otherwise.

Rules: references, emoji, banner, todo (errors); speculative, narration (warnings).
Suppress one deliberately with a comment on the line above:
  // silence-allow narration: <reason>

Config: silence.json at the repository root, every key optional:
  { "references": ["\\\\bC-\\\\d+\\\\b"], "rules": { "narration": "error" }, "ignore": ["gen/**"] }

Install: bun add -d github:brandonajlowe/silence

Claude Code (.claude/settings.json):
  "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit",
    "hooks": [{ "type": "command", "command": "bunx", "args": ["silence", "hook", "claude"] }] }]

pre-commit (.pre-commit-config.yaml, repo: local):
  - id: silence
    name: silence
    entry: bunx silence check --staged
    language: system
    pass_filenames: false

GitHub Actions:
  - run: bunx silence check --base origin/\${{ github.base_ref }} --format github
    (check out with fetch-depth: 0 so the merge base exists)
`;

async function check(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      staged: { type: "boolean" },
      base: { type: "string" },
      all: { type: "boolean" },
      format: { type: "string", default: "text" },
      strict: { type: "boolean" },
    },
  });
  const format = values.format as Format;
  if (!["text", "json", "github"].includes(format)) throw new UsageError(`unknown format: ${format}`);
  if ([values.staged, values.base !== undefined, values.all].filter(Boolean).length > 1) {
    throw new UsageError("choose one of --staged, --base, --all");
  }
  const mode: Mode = values.staged ? { kind: "staged" } : values.base ? { kind: "base", ref: values.base } : values.all ? { kind: "all" } : { kind: "head" };

  const found = repoRoot(process.cwd());
  if (!found) throw new UsageError("not inside a git repository");
  const root = realpathSync.native(found);
  const prefix = relative(root, realpathSync.native(process.cwd())).replaceAll("\\", "/");
  const wanted = positionals.map((p) => [prefix, p].filter(Boolean).join("/").replace(/^\.\/|\/$/g, "").replace(/^\.$/, ""));
  const inScope = (path: string) => wanted.length === 0 || wanted.some((w) => w === "" || path === w || path.startsWith(`${w}/`));

  const config = loadConfig(root);
  const findings: Finding[] = [];
  for (const [path, scope] of changes(root, mode)) {
    if (!inScope(path) || !languageOf(path)) continue;
    const source = readSource(root, path, mode);
    if (source !== null) findings.push(...(await checkSource(path, source, scope, config)));
  }
  process.stdout.write(render(findings, format));
  const failing = findings.filter((f) => values.strict || f.severity === "error");
  return failing.length > 0 ? 1 : 0;
}

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "check") return check(rest);
  if (command === "hook" && rest[0] === "claude") {
    const { code, message } = await claudeHook(await Bun.stdin.text());
    process.stderr.write(message);
    return code;
  }
  if (command === "--version" || command === "-v") {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(usage);
    return 0;
  }
  throw new UsageError(`unknown command: ${argv.join(" ")}`);
}

try {
  process.exitCode = await main(Bun.argv.slice(2));
} catch (error) {
  const usageProblem = error instanceof UsageError || (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS");
  process.stderr.write(`silence: ${(error as Error).message}\n${usageProblem ? "Run `silence --help` for usage.\n" : ""}`);
  process.exitCode = 2;
}
