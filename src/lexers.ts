export type RawComment = { line: number; endLine: number; column: number; text: string };

export function lexSql(source: string): RawComment[] {
  const out: RawComment[] = [];
  let line = 1;
  let lineStart = 0;
  let i = 0;
  const at = (s: string) => source.startsWith(s, i);
  const advance = (to: number) => {
    for (; i < to; i++) {
      if (source[i] === "\n") {
        line++;
        lineStart = i + 1;
      }
    }
  };
  while (i < source.length) {
    if (at("--")) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out.push({ line, endLine: line, column: i - lineStart + 1, text: source.slice(i, stop) });
      advance(stop);
    } else if (at("/*")) {
      const start = { line, column: i - lineStart + 1, index: i };
      let depth = 0;
      let j = i;
      while (j < source.length) {
        if (source.startsWith("/*", j)) {
          depth++;
          j += 2;
        } else if (source.startsWith("*/", j)) {
          depth--;
          j += 2;
          if (depth === 0) break;
        } else j++;
      }
      advance(j);
      out.push({ line: start.line, endLine: line, column: start.column, text: source.slice(start.index, j) });
    } else if (source[i] === "'" || source[i] === '"') {
      const quote = source[i]!;
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === quote && source[j + 1] === quote) j += 2;
        else if (source[j] === quote) break;
        else j++;
      }
      advance(j + 1);
    } else if (source[i] === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(source.slice(i, i + 64))?.[0];
      if (tag) {
        const end = source.indexOf(tag, i + tag.length);
        advance(end === -1 ? source.length : end + tag.length);
      } else advance(i + 1);
    } else advance(i + 1);
  }
  return out;
}

export function lexYaml(source: string): RawComment[] {
  const out: RawComment[] = [];
  const lines = source.split("\n");
  let scalarIndent = -1;
  lines.forEach((text, index) => {
    const indent = text.length - text.trimStart().length;
    if (scalarIndent >= 0) {
      if (text.trim() === "" || indent > scalarIndent) return;
      scalarIndent = -1;
    }
    const column = yamlCommentColumn(text);
    const code = column === -1 ? text : text.slice(0, column);
    if (column !== -1) out.push({ line: index + 1, endLine: index + 1, column: column + 1, text: text.slice(column).trimEnd() });
    if (/[|>][-+0-9]*\s*$/.test(code) && /(^|[:\-]\s+)[|>][-+0-9]*\s*$/.test(code.trimStart())) scalarIndent = indent;
  });
  return out;
}

function yamlCommentColumn(text: string): number {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'" && text[i + 1] === "'") i++;
      else if (c === "'") quote = null;
    } else if (quote === '"') {
      if (c === "\\") i++;
      else if (c === '"') quote = null;
    } else if (c === "'" || c === '"') {
      if (i === 0 || /[\s:\[{,\-]/.test(text[i - 1]!)) quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(text[i - 1]!))) return i;
  }
  return -1;
}
