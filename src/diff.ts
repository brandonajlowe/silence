import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Scope } from "./check";

export type Mode = { kind: "head" } | { kind: "staged" } | { kind: "base"; ref: string } | { kind: "all" };

const unquote = (p: string) =>
  p.startsWith('"') ? p.slice(1, -1).replace(/\\(["\\])/g, "$1").replace(/\\t/g, "\t").replace(/\\n/g, "\n") : p;

export function parseAddedLines(diff: string): Map<string, Set<number>> {
  const added = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = unquote(line.slice(4));
      current = target === "/dev/null" ? null : new Set();
      if (current) added.set(target.replace(/^b\//, ""), current);
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let l = start; l < start + count; l++) current.add(l);
    }
  }
  return added;
}

export class GitError extends Error {}

export function git(root: string, ...args: string[]): string {
  const r = Bun.spawnSync(["git", "-c", "core.quotePath=false", ...args], { cwd: root, stderr: "pipe" });
  if (r.exitCode !== 0) throw new GitError(`git ${args.join(" ")} failed: ${r.stderr.toString().trim()}`);
  return r.stdout.toString();
}

export function repoRoot(cwd: string): string | null {
  const r = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { cwd, stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

const hasHead = (root: string) => Bun.spawnSync(["git", "rev-parse", "--verify", "-q", "HEAD"], { cwd: root }).exitCode === 0;
const diffArgs = ["diff", "-U0", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"];
const zList = (out: string) => out.split("\0").filter(Boolean);

export function changes(root: string, mode: Mode): Map<string, Scope> {
  const scopes = new Map<string, Scope>();
  if (mode.kind === "all") {
    for (const path of zList(git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"))) scopes.set(path, "all");
    return scopes;
  }
  if (mode.kind === "staged") {
    const diff = git(root, ...diffArgs, "--cached", ...(hasHead(root) ? [] : ["--root"]));
    for (const [path, lines] of parseAddedLines(diff)) scopes.set(path, lines);
    if (!hasHead(root)) for (const path of zList(git(root, "ls-files", "-z", "--cached"))) scopes.set(path, "all");
    return scopes;
  }
  if (mode.kind === "base") {
    for (const [path, lines] of parseAddedLines(git(root, ...diffArgs, `${mode.ref}...HEAD`))) scopes.set(path, lines);
    return scopes;
  }
  if (hasHead(root)) {
    for (const [path, lines] of parseAddedLines(git(root, ...diffArgs, "HEAD"))) scopes.set(path, lines);
  } else {
    for (const path of zList(git(root, "ls-files", "-z", "--cached"))) scopes.set(path, "all");
  }
  for (const path of zList(git(root, "ls-files", "-z", "--others", "--exclude-standard"))) scopes.set(path, "all");
  return scopes;
}

export function readSource(root: string, path: string, mode: Mode): string | null {
  if (mode.kind === "staged") {
    const r = Bun.spawnSync(["git", "show", `:${path}`], { cwd: root });
    return r.exitCode === 0 ? r.stdout.toString() : null;
  }
  const full = join(root, path);
  return statSync(full, { throwIfNoEntry: false })?.isFile() ? readFileSync(full, "utf8") : null;
}
