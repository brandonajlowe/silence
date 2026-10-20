import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ruleIds = ["references", "emoji", "banner", "todo", "speculative", "narration", "allow-reason"] as const;
export type RuleId = (typeof ruleIds)[number];
export type Level = "error" | "warning" | "off";

export type ConfigInput = {
  references?: string[];
  rules?: Partial<Record<RuleId, Level>>;
  ignore?: string[];
};

export type Config = {
  references: RegExp[];
  rules: Record<RuleId, Level>;
  ignore: Bun.Glob[];
};

const defaultReferences = ["[\\w./-]+\\.md\\b", "\\bADR[- ]?\\d+\\b"];

const defaultIgnore = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/*.g.dart",
  "**/*.freezed.dart",
  "**/*.mapper.dart",
  "**/*.Designer.cs",
  "**/*.generated.*",
  "**/*.min.js",
];

const defaultRules: Record<RuleId, Level> = {
  references: "error",
  emoji: "error",
  banner: "error",
  todo: "error",
  speculative: "warning",
  narration: "warning",
  "allow-reason": "error",
};

export function resolveConfig(input: ConfigInput): Config {
  for (const rule of Object.keys(input.rules ?? {})) {
    if (!ruleIds.includes(rule as RuleId)) throw new Error(`unknown rule in silence.json: ${rule}`);
  }
  return {
    references: [...defaultReferences, ...(input.references ?? [])].map((p) => new RegExp(p, "u")),
    rules: { ...defaultRules, ...input.rules },
    ignore: [...defaultIgnore, ...(input.ignore ?? [])].map((g) => new Bun.Glob(g)),
  };
}

export function loadConfig(root: string): Config {
  const path = join(root, "silence.json");
  return resolveConfig(existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
}

export const isIgnored = (config: Config, path: string) => config.ignore.some((g) => g.match(path.replaceAll("\\", "/")));
