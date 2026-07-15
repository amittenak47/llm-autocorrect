/** Inclusive line region for queue locks and overlap checks. */

export interface LineRegion {
  startLine: number;
  endLine: number;
}

export function normalizeRegion(line: number, endLine?: number): LineRegion {
  const end = endLine ?? line;
  return {
    startLine: Math.min(line, end),
    endLine: Math.max(line, end),
  };
}

export function regionsOverlap(a: LineRegion, b: LineRegion): boolean {
  return a.startLine <= b.endLine && b.startLine <= a.endLine;
}

export function regionsEqual(a: LineRegion, b: LineRegion): boolean {
  return a.startLine === b.startLine && a.endLine === b.endLine;
}

export function regionContainsLine(region: LineRegion, line: number): boolean {
  return line >= region.startLine && line <= region.endLine;
}

/** Line count delta after replacing a region with new text. */
export function lineDeltaAfterReplace(originalLineCount: number, newText: string): number {
  const newLineCount = Math.max(1, newText.split("\n").length);
  return newLineCount - originalLineCount;
}

export function shiftRegion(region: LineRegion, delta: number): LineRegion {
  return {
    startLine: region.startLine + delta,
    endLine: region.endLine + delta,
  };
}

export function unionRegion(a: LineRegion, b: LineRegion): LineRegion {
  return {
    startLine: Math.min(a.startLine, b.startLine),
    endLine: Math.max(a.endLine, b.endLine),
  };
}

/** True when regions touch on the next line (no gap). */
export function regionsAdjacent(a: LineRegion, b: LineRegion): boolean {
  return a.endLine + 1 === b.startLine || b.endLine + 1 === a.startLine;
}

export function canMergeRegions(a: LineRegion, b: LineRegion): boolean {
  return regionsOverlap(a, b) || regionsAdjacent(a, b);
}

/** Stable hash for baseline text (disambiguates duplicate snippets). */
export function baselineHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}
