import { NearbyMode, SignatureDepth } from "./profiles";

const SIG_RE = /^\s*(?:async\s+)?(class|def|function|func|interface|struct|enum)\s+\w+/;

export function indentWidth(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") {
      n++;
    } else if (ch === "\t") {
      n += 4;
    } else {
      break;
    }
  }
  return n;
}

/**
 * Collect nearby lines. `window` = flat N above / M below.
 * `indentScope` = walk up within same/outer indent (plus one outer header), and down within scope.
 */
export function collectNearbyLines(
  lines: string[],
  startLine: number,
  endLine: number,
  maxAbove: number,
  maxBelow: number,
  mode: NearbyMode
): string {
  if (mode === "window") {
    const above: string[] = [];
    const from = Math.max(0, startLine - maxAbove);
    for (let i = from; i < startLine; i++) {
      above.push(lines[i] ?? "");
    }
    const below: string[] = [];
    for (let i = endLine + 1; i <= Math.min(lines.length - 1, endLine + maxBelow); i++) {
      below.push(lines[i] ?? "");
    }
    return [...above, ...below].join("\n");
  }

  const targetIndent = indentWidth(lines[startLine] ?? "");
  const above: string[] = [];
  let outerHeader: string | undefined;
  for (let i = startLine - 1; i >= 0 && above.length < maxAbove; i--) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      above.unshift(line);
      continue;
    }
    const ind = indentWidth(line);
    if (ind >= targetIndent) {
      above.unshift(line);
      continue;
    }
    // One outer header (lower indent) then stop walking further out.
    if (!outerHeader) {
      outerHeader = line;
      above.unshift(line);
    }
    break;
  }

  const below: string[] = [];
  for (let i = endLine + 1; i < lines.length && below.length < maxBelow; i++) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      below.push(line);
      continue;
    }
    const ind = indentWidth(line);
    if (ind < targetIndent) {
      break;
    }
    below.push(line);
  }

  return [...above, ...below].join("\n");
}

/** Enclosing signature header or chain (class + def), scanning up from line. */
export function enclosingSignatureText(
  lines: string[],
  line: number,
  depth: SignatureDepth
): string | undefined {
  const found: string[] = [];
  const start = Math.min(line, lines.length - 1);
  for (let i = start; i >= Math.max(0, line - 80); i--) {
    const t = lines[i] ?? "";
    if (SIG_RE.test(t)) {
      found.push(t.trim());
      if (depth === "header") {
        break;
      }
      if (found.length >= 3) {
        break;
      }
    }
  }
  if (found.length === 0) {
    return undefined;
  }
  // found is nearest-first; reverse so outer → inner
  return found.reverse().join("\n");
}

/** Budget-friendly chunk order: target, signature, nearby, then ring tiers. */
export function orderContextChunks<T extends { tier: string }>(chunks: T[]): T[] {
  const rank: Record<string, number> = {
    target: 0,
    signature: 1,
    nearby: 2,
    recentEdits: 3,
    openTabs: 4,
    yank: 5,
  };
  return [...chunks].sort((a, b) => (rank[a.tier] ?? 50) - (rank[b.tier] ?? 50));
}
