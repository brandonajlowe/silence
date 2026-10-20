import type { Finding } from "./check";

export type Format = "text" | "json" | "github";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const firstLine = (text: string) => text.split("\n")[0]!.trim();
const escapeData = (s: string) => s.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const escapeProperty = (s: string) => escapeData(s).replaceAll(":", "%3A").replaceAll(",", "%2C");

export function render(findings: Finding[], format: Format): string {
  if (format === "json") return JSON.stringify(findings, null, 2) + "\n";
  if (findings.length === 0) return "";
  if (format === "github") {
    return findings
      .map((f) => {
        const kind = f.severity === "error" ? "error" : "warning";
        return `::${kind} file=${escapeProperty(f.path)},line=${f.line},col=${f.column},title=silence/${f.rule}::${escapeData(`${f.message}: ${firstLine(f.text)}`)}`;
      })
      .join("\n") + "\n";
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  const lines = findings.map(
    (f) => `${f.path}:${f.line}:${f.column}  ${f.severity.padEnd(7)}  ${f.rule.padEnd(12)}  ${f.message}\n    ${firstLine(f.text)}`,
  );
  return `${lines.join("\n")}\n\n${plural(errors, "error")}, ${plural(findings.length - errors, "warning")}\n`;
}
