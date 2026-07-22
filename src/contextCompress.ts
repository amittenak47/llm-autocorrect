import { estimateTokens } from "./promptLimits";

/** Strip blank lines from context chunks (not targets). */
export function stripBlankLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .join("\n");
}

/** Truncate each line to maxChars, append ellipsis when trimmed. */
export function truncateLines(text: string, maxChars: number): string {
  return text
    .split("\n")
    .map((line) => (line.length > maxChars ? line.slice(0, maxChars) + "…" : line))
    .join("\n");
}

/** Collapse consecutive import lines into one summary line. */
export function collapseImports(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let importRun = 0;
  for (const line of lines) {
    if (/^\s*(import |from |#include|using )/.test(line)) {
      importRun++;
      if (importRun === 1) {
        out.push(line);
      }
    } else {
      if (importRun > 1) {
        out.push(`// … ${importRun - 1} more import line(s)`);
      }
      importRun = 0;
      out.push(line);
    }
  }
  if (importRun > 1) {
    out.push(`// … ${importRun - 1} more import line(s)`);
  }
  return out.join("\n");
}

export function dedupeChunks(chunks: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const key = c.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(c);
  }
  return out;
}

export interface ContextChunk {
  tier: string;
  label: string;
  text: string;
}

/** Fill chunks in priority order until token budget exhausted. P0 (target) is never dropped. */
export function assembleWithinBudget(
  chunks: ContextChunk[],
  budget: number
): { body: string; includedTiers: string[]; estimatedTokens: number } {
  if (chunks.length === 0) {
    return { body: "", includedTiers: [], estimatedTokens: 0 };
  }
  const included: ContextChunk[] = [chunks[0]];
  let used = estimateTokens(chunks[0].text);
  for (let i = 1; i < chunks.length; i++) {
    const tok = estimateTokens(chunks[i].text);
    if (used + tok > budget) {
      break;
    }
    included.push(chunks[i]);
    used += tok;
  }
  const body = included
    .map((c) => (c.label ? `--- ${c.label} ---\n${c.text}` : c.text))
    .join("\n\n");
  return {
    body,
    includedTiers: included.map((c) => c.tier),
    estimatedTokens: estimateTokens(body),
  };
}
