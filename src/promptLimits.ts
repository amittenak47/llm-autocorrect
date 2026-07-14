/** Rough token estimate for English/code text (conservative for budgeting). */
export function estimateTokens(...parts: string[]): number {
  return parts.reduce((sum, p) => sum + Math.ceil(p.length / 4), 0);
}

/** Groq free tier bills a request against a ~6000 TPM bucket; input + max_tokens must fit. */
export const GROQ_REQUEST_TOKEN_BUDGET = 6000;

export function capMaxTokens(
  provider: string,
  requested: number,
  system: string,
  user: string
): number {
  if (provider !== "groq") {
    return requested;
  }
  const inputTokens = estimateTokens(system, user);
  const headroom = GROQ_REQUEST_TOKEN_BUDGET - inputTokens - 64;
  return Math.max(64, Math.min(requested, headroom, 2048));
}

/** Keep only the closest context lines and trim very long lines. */
export function trimContextLines(lines: string[], maxLines: number, maxLineChars: number): string {
  const slice = lines.slice(-maxLines);
  return slice
    .map((line) => (line.length > maxLineChars ? line.slice(0, maxLineChars) + "…" : line))
    .join("\n");
}
