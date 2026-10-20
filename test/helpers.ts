import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const cli = join(import.meta.dir, "..", "src", "cli.ts");

export function git(cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["git", ...args], { cwd, stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.toString();
}

export function repo(files: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "silence-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  write(dir, files);
  if (Object.keys(files).length) {
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "base");
  }
  return dir;
}

export function write(dir: string, files: Record<string, string>) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
}

export function run(cwd: string, args: string[], stdin?: string) {
  const r = Bun.spawnSync(["bun", cli, ...args], { cwd, stdin: stdin === undefined ? undefined : Buffer.from(stdin) });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}
