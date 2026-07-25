import { LanguageProfile } from "./languages";
import { stripFences, stripTrailingLineComment } from "./textUtils";

/** Normalize raw LLM text: strip fences, CRLF, trailing newline. */
export function normalizeModelText(response: string): string {
  return stripFences(response).replace(/\r/g, "").replace(/\r?\n$/, "");
}

export function isUnchanged(text: string): boolean {
  return text.trim() === "UNCHANGED";
}

/** Non-empty lines from model output; [] for UNCHANGED or blank. */
export function modelLines(response: string): string[] {
  const text = normalizeModelText(response);
  if (isUnchanged(text) || text.trim().length === 0) {
    return [];
  }
  return text.split("\n");
}

/**
 * Accept model output for a single-line target. Extra lines are kept (e.g. a
 * missing `)` on its own line). Leading/trailing blank lines are dropped.
 */
export function fixForSingleLineTarget(lines: string[]): string | undefined {
  const start = lines.findIndex((l) => l.trim().length > 0);
  if (start < 0) {
    return undefined;
  }
  let end = lines.length - 1;
  while (end > start && lines[end].trim().length === 0) {
    end--;
  }
  return lines.slice(start, end + 1).join("\n");
}

/**
 * Reattach the buffer's leading whitespace on the first line. Models often
 * strip Enter auto-indent; the IDE indent is authoritative for typo fixes.
 */
export function preserveLeadingIndent(original: string, corrected: string): string {
  const lead = original.match(/^[ \t]*/)?.[0] ?? "";
  const lines = corrected.split("\n");
  if (lines.length === 0) {
    return corrected;
  }
  lines[0] = lead + lines[0].replace(/^[ \t]*/, "");
  return lines.join("\n");
}

/**
 * Line-aligned apply text for a block of `lineCount` lines. Pads with blank
 * lines or truncates so the result always has exactly `lineCount` lines when
 * `preserveLineCount` is true (caveman). Otherwise returns full model text.
 */
export function alignToLineCount(
  modelText: string,
  lineCount: number,
  preserveLineCount: boolean
): string {
  const lines = modelText.split("\n");
  if (!preserveLineCount) {
    return modelText;
  }
  if (lines.length === lineCount) {
    return modelText;
  }
  if (lines.length < lineCount) {
    return [...lines, ...Array(lineCount - lines.length).fill("")].join("\n");
  }
  return lines.slice(0, lineCount).join("\n");
}

/**
 * Caveman-safe merge: keep original code on each line; append only a trailing
 * comment taken from the model line when the code portion still matches.
 * Returns undefined if the model rewrote code on any line.
 */
export function mergeCavemanComments(
  original: string,
  modelText: string,
  profile: LanguageProfile
): string | undefined {
  const origLines = original.split("\n");
  const modelLinesArr = modelText.split("\n");
  if (origLines.length !== modelLinesArr.length) {
    return undefined;
  }
  const prefixes = profile.lineCommentPrefixes;
  const out: string[] = [];
  for (let i = 0; i < origLines.length; i++) {
    const o = origLines[i];
    const m = modelLinesArr[i];
    const oCode = stripTrailingLineComment(o, prefixes);
    const mCode = stripTrailingLineComment(m, prefixes);
    if (oCode.trim() !== mCode.trim()) {
      return undefined;
    }
    const commentPart = m.slice(stripTrailingLineComment(m, prefixes).length);
    if (!commentPart.trim()) {
      out.push(o);
      continue;
    }
    // Preserve original indentation/code; attach model comment suffix.
    const base = oCode.length > 0 ? oCode : o.replace(/\s+$/, "");
    if (commentPart.startsWith(" ") || commentPart.startsWith("\t")) {
      out.push(base + commentPart);
    } else {
      out.push(`${base} ${commentPart}`);
    }
  }
  return out.join("\n");
}
