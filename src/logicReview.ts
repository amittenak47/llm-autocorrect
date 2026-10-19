import { stripFences } from "./textUtils";

export interface LogicIssue {
  line: number;
  message: string;
  replacement?: string;
  confidence: "high" | "medium";
}

export function buildLogicPrompt(code: string, languageName: string, maxIssues: number): { system: string; user: string } {
  const lines = code.split(/\r?\n/);
  const width = Math.max(3, String(lines.length).length);
  return {
    system: `You review ${languageName} code for likely LOGIC bugs only — not style, naming, typos or syntax. Examples: ` +
      `off-by-one ranges, wrong comparison or inverted condition, using the wrong variable, missing return, mutable ` +
      `default arguments, integer vs float division, unhandled None/null, wrong loop bounds, accumulating into the wrong ` +
      `variable. Report only issues you are fairly confident are real bugs, at most ${maxIssues}. Reply with JSON only, no fences: ` +
      `{"issues":[{"line":<line number shown in the code>,"message":"<one sentence>","replacement":"<the full corrected text of that single line, keeping its indentation>","confidence":"high"|"medium"}]}. ` +
      `Omit "replacement" when the fix is not a single-line change. Reply {"issues":[]} when you find nothing.`,
    user: lines.map((line, i) => `${String(i + 1).padStart(width)}| ${line}`).join("\n"),
  };
}

export function parseLogicIssues(text: string, lineCount: number, maxIssues: number): LogicIssue[] {
  const stripped = stripFences(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(stripped.indexOf("{"), stripped.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || !("issues" in parsed) || !Array.isArray(parsed.issues)) return [];
  const issues: LogicIssue[] = [];
  for (const entry of parsed.issues) {
    if (!entry || typeof entry !== "object" || !Number.isInteger(entry.line) ||
      entry.line < 1 || entry.line > lineCount || typeof entry.message !== "string" || !entry.message.trim()) continue;
    const confidence = entry.confidence === undefined ? "medium" : entry.confidence;
    if (confidence !== "high" && confidence !== "medium") continue;
    const issue: LogicIssue = { line: entry.line, message: entry.message.trim(), confidence };
    if (typeof entry.replacement === "string" && entry.replacement.trim() && !/[\r\n]/.test(entry.replacement)) {
      // The reviewer compares against the original line, which is not an input to this parser.
      issue.replacement = entry.replacement;
    }
    issues.push(issue);
  }
  return issues.sort((a, b) => Number(b.confidence === "high") - Number(a.confidence === "high"))
    .slice(0, Number.isFinite(maxIssues) ? Math.max(0, Math.floor(maxIssues)) : 0);
}
