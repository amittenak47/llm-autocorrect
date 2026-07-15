/** Pure helper: decoration ranges for a queued fix (one range per line). */

export interface QueueFixSpan {
  line: number;
  endLine?: number;
}

export function decorationLineNumbers(fix: QueueFixSpan): number[] {
  const end = fix.endLine ?? fix.line;
  const lines: number[] = [];
  for (let i = fix.line; i <= end; i++) {
    lines.push(i);
  }
  return lines;
}
