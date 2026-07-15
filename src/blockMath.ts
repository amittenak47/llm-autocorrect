// Pure helpers for block operations and the fix queue (no VS Code runtime — unit tested).

import { estimateTokens } from "./promptLimits";

/** Output budget for whole-block LLM operations: the block again plus headroom for additions. */
export function blockMaxTokens(text: string): number {
  return Math.min(4096, Math.max(256, estimateTokens(text) * 2 + 128));
}

export interface ShiftedLine {
  line: number;
  /** The change overlapped this line — its queued fix must be re-validated against the buffer. */
  touched: boolean;
}

/**
 * How a buffer change moves a queued fix's line number.
 * `addedLines` is the number of line breaks in the inserted text.
 */
export function shiftLine(
  line: number,
  changeStartLine: number,
  changeEndLine: number,
  addedLines: number
): ShiftedLine {
  if (line < changeStartLine) {
    return { line, touched: false };
  }
  if (line > changeEndLine) {
    return { line: line + addedLines - (changeEndLine - changeStartLine), touched: false };
  }
  return { line, touched: true };
}
