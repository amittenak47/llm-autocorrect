/** Granite Guardian judge helpers (pure — no vscode). */

/**
 * Strict BYOC criteria — default to rejecting anything that is not a clear,
 * minimal typo/syntax fix. Style-only edits and invented names must score 'no'.
 */
export const AUTOCORRECT_BYOC_CRITERIA =
  "Score 'yes' ONLY if EVERY condition holds; otherwise score 'no'. When unsure, score 'no'. " +
  "(1) ASSISTANT_REPLY is a minimal typo/syntax fix of ORIGINAL (TARGET/SOURCE) — not a rewrite, " +
  "refactor, rename, or style pass. " +
  "(2) String/char literal contents are preserved exactly (do not change messages, paths, or quotes " +
  "inside literals). " +
  "(3) Do not invent functions, variables, or identifiers that are not implied by fixing an " +
  "obvious misspelling of a keyword/builtin or of a name already present in ORIGINAL. " +
  "(4) Custom/domain names that are intentional must stay; only clear keyboard typos may change. " +
  "(5) Reject style-only diffs: removing/adding semicolons, changing quote style, reformatting, " +
  "or 'cleanup' when ORIGINAL had no real error. " +
  "(6) No surrounding file context, no prose, no markdown fences — code only. " +
  "(7) The edit must be the smallest change that repairs the mistake.";

const GUARDIAN_NOTHINK =
  "<no-think>As a judge agent, assess whether the provided text meets the given " +
  "judging criteria using all available information. Be strict: prefer 'no' over 'yes' " +
  "if any criterion fails or is ambiguous. Provide your score immediately " +
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
    `### Scoring Schema: Return 'yes' only if ASSISTANT_REPLY fully meets the criteria. ` +
    `Otherwise return 'no'. If uncertain, return 'no'.`;

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
