import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { checkSource, type Finding } from "./check";
import { loadConfig } from "./config";
import { changes, readSource, repoRoot } from "./diff";

type ToolEvent = {
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; edits?: { new_string?: string }[] };
};

const writers = new Set(["Write", "Edit", "MultiEdit"]);

export async function claudeHook(stdin: string): Promise<{ code: number; message: string }> {
  let event: ToolEvent;
  try {
    event = JSON.parse(stdin);
  } catch {
    return { code: 0, message: "silence: hook input was not JSON; comment check skipped\n" };
  }
  const input = event.tool_input;
  if (!writers.has(event.tool_name ?? "") || !input?.file_path) return { code: 0, message: "" };

  const given = isAbsolute(input.file_path) ? input.file_path : join(event.cwd ?? process.cwd(), input.file_path);
  if (!existsSync(given)) return { code: 0, message: "" };
  const file = realpathSync.native(given);
  const found = repoRoot(dirname(file));
  if (!found) return { code: 0, message: "" };
  const root = realpathSync.native(found);
  const path = relative(root, file).replaceAll("\\", "/");
  const source = readSource(root, path, { kind: "head" });
  if (source === null) return { code: 0, message: "" };

  const scope = changes(root, { kind: "head" }).get(path) ?? new Set<number>();
  const written = [input.content, input.new_string, ...(input.edits ?? []).map((e) => e.new_string)].filter(Boolean).join("\n");
  const ownedByEdit = (f: Finding) => f.text.split("\n").some((l) => l.trim() !== "" && written.includes(l.trim()));
  const findings = (await checkSource(path, source, scope, loadConfig(root))).filter(ownedByEdit);
  if (findings.length === 0) return { code: 0, message: "" };

  const lines = findings.map((f) => `  line ${f.line}  ${f.rule} (${f.severity}): ${f.message}\n    ${f.text.split("\n")[0]!.trim()}`);
  return {
    code: 2,
    message: [
      `silence: comments you just wrote in ${path} break the comment policy.`,
      ...lines,
      "Delete each one, or rewrite it to record the non-obvious reason the code cannot express.",
      "Warnings are heuristics: if the comment already carries a real reason, keep it and add",
      "`silence-allow <rule>: <reason>` on the line above.",
      "",
    ].join("\n"),
  };
}
