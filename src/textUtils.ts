/**
 * Strip markdown code fences a model may wrap its answer in, despite instructions.
 * Handles full-string fences and prose-wrapped fences (extracts first fenced block).
 */
export function stripFences(text: string): string {
  const t = text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
  const full = t.match(/^```[\w+-]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (full) {
    return full[1].replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
  }
  const embedded = t.match(/```[\w+-]*\r?\n([\s\S]*?)\r?\n?```/);
  if (embedded) {
    return embedded[1].replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
  }
  return t;
}

/** Strip a trailing line-comment from a code line (language-aware prefixes). */
export function stripTrailingLineComment(line: string, prefixes: string[]): string {
  let inSingle = false;
  let inDouble = false;
  let inTick = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";
    if (ch === "'" && !inDouble && !inTick && prev !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle && !inTick && prev !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "`" && !inSingle && !inDouble && prev !== "\\") {
      inTick = !inTick;
      continue;
    }
    if (inSingle || inDouble || inTick) {
      continue;
    }
    for (const p of prefixes) {
      if (line.startsWith(p, i)) {
        return line.slice(0, i).replace(/\s+$/, "");
      }
    }
  }
  return line;
}
