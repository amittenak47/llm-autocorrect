import { stripFences } from "./textUtils";

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
