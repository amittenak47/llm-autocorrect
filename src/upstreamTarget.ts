export interface DiagLike {
  startLine: number;
  endLine: number;
  message: string;
  severity: number;
}

export const MAX_UPSTREAM_LOOKBACK = 8;
export const CASCADE_DIAG = /unexpected indentation|can be used only within|is not defined/i;
export const ROOT_DIAG =
  /\bexpected\s+(?:[^\w\s]|(?:expression|indented block|member name|parameter name|class name|function name|newline)\b)|invalid syntax|unterminated|was never closed|statements must be separated|\(parser\)$/i;

export interface DiagPatterns { cascade: RegExp; root: RegExp }

export function diagPatterns(languageId: string): DiagPatterns {
  switch (languageId) {
    case "typescript":
    case "javascript":
      return {
        root: /^(?:'[^']{1,4}' expected|Expression expected|Declaration or statement expected|Identifier expected|Unexpected token|Invalid character|Unterminated (?:string|template|regular expression) literal|Argument expression expected|Property assignment expected|Type expected|Unexpected keyword or identifier)|\(parser\)$/i,
        cascade: /^Cannot find name '|is not defined|^Unreachable code detected/i,
      };
    case "go":
      return {
        root: /^(?:syntax error\b|expected '|unexpected newline|missing ',')|\(parser\)$/i,
        cascade: /^undefined: /i,
      };
    case "rust":
      return {
        root: /^(?:expected one of|expected (?:expression|item|identifier|type|pattern|`)|unclosed delimiter|mismatched closing delimiter|this file contains an unclosed delimiter|unterminated)|\(parser\)$/i,
        cascade: /^(?:cannot find (?:value|function|macro|type)|unresolved name)/i,
      };
    case "java":
      return {
        root: /^(?:Syntax error|Unclosed|Invalid character|String literal is not properly closed)|\(parser\)$/i,
        cascade: /cannot be resolved(?: to a (?:variable|type))?$/i,
      };
    case "c":
    case "cpp":
      return {
        root: /^(?:expected\b|unterminated|missing terminating|extraneous closing)|\(parser\)$/i,
        cascade: /^(?:use of undeclared identifier|unknown type name)/i,
      };
    case "zig":
      return {
        // "expected type 'u32', found 'bool'" is a type error, not a syntax root.
        root: /^(?:expected (?!type\b).+, found|invalid token|unterminated)|\(parser\)$/i,
        cascade: /^use of undeclared identifier/i,
      };
    default:
      return { cascade: CASCADE_DIAG, root: ROOT_DIAG };
  }
}

export function hasUpstreamEvidence(line: number, diags: DiagLike[]): boolean {
  return diags.some((d) => d.severity <= 1 && d.startLine <= line && line <= d.endLine);
}

export function resolveUpstreamTarget(line: number, diags: DiagLike[], lineText: (i: number) => string, languageId = "python"): number {
  const patterns = diagPatterns(languageId);
  const relevant = diags.filter((d) => d.severity <= 1);
  const overlapping = relevant.filter((d) => d.startLine <= line && line <= d.endLine);
  if (overlapping.length === 0) {
    return line;
  }
  for (const d of overlapping) {
    if (d.startLine < line && line - d.startLine <= MAX_UPSTREAM_LOOKBACK && patterns.root.test(d.message)) {
      return d.startLine;
    }
  }
  const startingHere = relevant.filter((d) => d.startLine === line);
  const forCascade = startingHere.length > 0 ? startingHere : overlapping;
  if (!forCascade.every((d) => patterns.cascade.test(d.message))) {
    return line;
  }
  for (let prev = line - 1; prev >= 0 && prev >= line - MAX_UPSTREAM_LOOKBACK; prev--) {
    if (lineText(prev).trim().length === 0) {
      continue;
    }
    const prevStart = relevant.filter((d) => d.startLine === prev);
    const prevDiags = prevStart.length > 0 ? prevStart : relevant.filter((d) => d.startLine <= prev && prev <= d.endLine);
    if (prevDiags.some((d) => patterns.root.test(d.message))) {
      return prev;
    }
  }
  return line;
}
