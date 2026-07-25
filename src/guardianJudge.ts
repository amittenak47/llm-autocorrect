/** Granite Guardian judge helpers (pure — no vscode). */

export const AUTOCORRECT_BYOC_CRITERIA =
  "The assistant reply is a minimal code correction of the TARGET/SOURCE only. " +
  "It preserves string literals from the original, does not invent unrelated functions " +
  "or identifiers, does not paste surrounding file context, and contains no prose or markdown fences.";

const GUARDIAN_NOTHINK =
  "<no-think>As a judge agent, assess whether the provided text meets the given " +
  "judging criteria using all available information. Provide your score immediately " +
  "without explanation. Output empty <think>\n</think> tags followed by your score " +
  "in <score></score> tags.";

/** Build the final user message block for Guardian (no-think / low latency). */
export function buildGuardianJudgeUserMessage(opts: {
  original: string;
  candidate: string;
  criteria?: string;
}): string {
  const criteria = opts.criteria ?? AUTOCORRECT_BYOC_CRITERIA;
  const guardianBlock =
    `<guardian>${GUARDIAN_NOTHINK}\n\n` +
    `### Criteria: ${criteria}\n\n` +
    `### Scoring Schema: If the last assistant's text meets the criteria, return 'yes'; otherwise, return 'no'.`;

  return (
    `ORIGINAL:\n${opts.original}\n\n` +
    `ASSISTANT_REPLY:\n${opts.candidate}\n\n` +
    guardianBlock
  );
}

/**
 * Parse Guardian score. Prefers <score>yes|no</score>; falls back to bare yes/no.
 * Returns undefined if unparseable.
 */
export function parseGuardianScore(text: string): "yes" | "no" | undefined {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const tagged = cleaned.match(/<score>\s*(yes|no)\s*<\/score>/i);
  if (tagged) {
    return tagged[1].toLowerCase() as "yes" | "no";
  }
  const bare = cleaned.match(/^\s*(yes|no)\s*$/im);
  if (bare) {
    return bare[1].toLowerCase() as "yes" | "no";
  }
  // Last-line heuristic
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1]?.toLowerCase();
  if (last === "yes" || last === "no") {
    return last;
  }
  return undefined;
}

export class GuardianRejectedError extends Error {
  readonly candidate: string;
  constructor(candidate: string, detail?: string) {
    super(detail ?? "Guardian rejected the correction");
    this.name = "GuardianRejectedError";
    this.candidate = candidate;
  }
}
