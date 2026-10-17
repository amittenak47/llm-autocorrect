export function enclosingBlockSpan(
  lines: string[], line: number, languageId: string, maxLines = 200
): { startLine: number; endLine: number } | undefined {
  if (!Number.isInteger(line) || line < 0 || line >= lines.length || !Number.isFinite(maxLines) || maxLines < 1) return undefined;
  const limit = Math.floor(maxLines);
  if (languageId === "python") {
    const indent = (text: string) => text.match(/^\s*/)?.[0].replace(/\t/g, "        ").length ?? 0;
    const cursorIndent = indent(lines[line]);
    for (let startLine = line; startLine >= 0; startLine--) {
      if (!/^\s*(async\s+)?(def|class)\s/.test(lines[startLine])) continue;
      const headerIndent = indent(lines[startLine]);
      if (startLine !== line && headerIndent > cursorIndent) continue;
      let endLine = startLine;
      while (endLine + 1 < lines.length && (!lines[endLine + 1].trim() || indent(lines[endLine + 1]) > headerIndent)) endLine++;
      while (endLine > startLine && !lines[endLine].trim()) endLine--;
      if (line <= endLine) return { startLine, endLine: Math.min(endLine, startLine + limit - 1) };
    }
    return undefined;
  }

  // Preserve columns while hiding quoted text and comments from header/brace matching.
  let quote = "";
  let blockComment = false;
  const code = lines.map((text) => {
    let clean = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (blockComment) {
        if (text.startsWith("*/", i)) { blockComment = false; clean += "  "; i++; }
        else clean += " ";
      } else if (quote) {
        clean += " ";
        if (ch === "\\") { clean += " "; i++; }
        else if (ch === quote) quote = "";
      } else if (text.startsWith("//", i)) {
        clean += " ".repeat(text.length - i);
        break;
      } else if (text.startsWith("/*", i)) {
        blockComment = true;
        clean += "  ";
        i++;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        quote = ch;
        clean += " ";
      } else clean += ch;
    }
    return clean;
  });
  for (let startLine = line; startLine >= 0; startLine--) {
    const header = code[startLine];
    const keyword = /\b(function|func|fn|def|class|struct|impl|interface)\b/.test(header);
    const signature = /\)\s*(\{|=>\s*\{)\s*$|\)\s*->\s*[^{]+\{\s*$/.test(header) &&
      !/^\s*(?:}\s*)?(if|else|for|while|switch|catch|with|synchronized)\b/.test(header);
    if (!keyword && !signature) continue;
    let depth = 0;
    let opened = false;
    for (let endLine = startLine; endLine < lines.length; endLine++) {
      for (const ch of code[endLine]) {
        if (ch === "{") { depth++; opened = true; }
        else if (ch === "}" && opened) depth--;
        if (opened && depth === 0) {
          if (line <= endLine) return { startLine, endLine: Math.min(endLine, startLine + limit - 1) };
          break;
        }
      }
      if (opened && depth === 0) break;
    }
  }
  return undefined;
}
