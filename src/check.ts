import { isIgnored, type Config, type RuleId } from "./config";
import { extractComments, type Allow } from "./extract";
import { evaluate } from "./rules";

export type Finding = {
  path: string;
  line: number;
  column: number;
  rule: RuleId;
  severity: "error" | "warning";
  message: string;
  text: string;
};

export type Scope = Set<number> | "all";

export async function checkSource(path: string, source: string, scope: Scope, config: Config): Promise<Finding[]> {
  if (isIgnored(config, path)) return [];
  const comments = await extractComments(path, source);
  if (!comments) return [];
  const findings: Finding[] = [];
  let carried: Allow[] = [];
  for (const comment of comments) {
    const allows = [...comment.allows, ...carried.filter((a) => comment.line === a.line + 1)];
    carried = comment.body === "" ? comment.allows : [];
    const touched = scope === "all" || Array.from({ length: comment.endLine - comment.line + 1 }, (_, i) => comment.line + i).some((l) => scope.has(l));
    if (!touched || comment.directive) continue;
    const at = { path, line: comment.line, column: comment.column, text: comment.text };
    const reasonLevel = config.rules["allow-reason"];
    for (const allow of comment.allows.filter((a) => a.reason === "")) {
      if (reasonLevel === "off") break;
      findings.push({ ...at, line: allow.line, rule: "allow-reason", severity: reasonLevel, message: "silence-allow needs a reason after a colon" });
    }
    const allowed = new Set(allows.filter((a) => a.reason !== "").flatMap((a) => a.rules));
    if (comment.body === "") continue;
    for (const hit of evaluate(comment, config)) {
      const level = config.rules[hit.rule];
      if (level === "off" || allowed.has(hit.rule)) continue;
      findings.push({ ...at, rule: hit.rule, severity: level, message: hit.message });
    }
  }
  return findings;
}
