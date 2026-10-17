/** Find unclosed brackets and explicit continuations before the line just left. */
export function statementSpan(
  lines: string[], line: number, maxLines = 10, commentPrefixes: string[] = ["#", "//"]
): { startLine: number; endLine: number } {
  const lower = Math.max(0, line - Math.max(0, maxLines - 1));
  const open: Array<{ bracket: string; line: number }> = [];
  const codeLines = new Map<number, string>();
  let quote = "";
  let escaped = false;
  for (let row = lower; row < line; row++) {
    const text = lines[row] ?? "";
    let code = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (text.startsWith(quote, i)) {
          i += quote.length - 1;
          quote = "";
        }
        continue;
      }
      if (commentPrefixes.some((prefix) => text.startsWith(prefix, i))) break;
      if (ch === "'" || ch === '"' || ch === "`") {
        quote = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
        i += quote.length - 1;
        code += "x";
        continue;
      }
      code += ch;
      if ("([{".includes(ch)) open.push({ bracket: ch, line: row });
      const closing = ")]}".indexOf(ch);
      if (closing >= 0) {
        const index = open.map((entry) => entry.bracket).lastIndexOf("([{"[closing]);
        if (index >= 0) open.splice(index, 1);
      }
    }
    // Bare single/double quoted strings end at a newline unless escaped.
    if (quote.length === 1 && quote !== "`" && !escaped) quote = "";
    escaped = false;
    codeLines.set(row, code);
  }
  let startLine = open.length ? open[0].line : line;
  // Explicit continuations may precede either the target or its opening bracket.
  while (startLine > lower && codeLines.get(startLine - 1)?.trimEnd().endsWith("\\")) startLine--;
  return { startLine, endLine: line };
}
