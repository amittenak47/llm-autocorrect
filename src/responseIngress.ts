import { LanguageProfile } from "./languages";
import { stripFences, stripTrailingLineComment } from "./textUtils";

/** Normalize raw LLM text: strip fences, CRLF, trailing newline. */
export function normalizeModelText(response: string): string {
  return stripFences(response).replace(/\r/g, "").replace(/\r?\n$/, "");
}

export function isUnchanged(text: string): boolean {
  return text.trim() === "UNCHANGED";
}

// Labels small models copy from the prompt ("REPLY:", "Correction:") instead of answering with bare code.
const LABEL_WORDS =
  "REPLY|ANSWER|OUTPUT|RESULT|CODE(?: BLOCK)?|CORRECTION|CORRECTED(?: LINE| CODE)?|FIXED(?: LINE| CODE)?|TARGET(?: LINE)?";
const TITLE_WORDS =
  "Reply|Answer|Output|Result|Code(?: block)?|Correction|Corrected(?: line| code)?|Fixed(?: line| code)?|Target(?: line)?";
/** A line that is only a label, e.g. "REPLY:" or "Correction:" — never valid code on its own. */
const LABEL_ONLY = new RegExp(`^\\s*(?:=>|->|→)?\\s*(?:${LABEL_WORDS}|${TITLE_WORDS})\\s*:\\s*$`);
/** An uppercase label before the code on the same line. Lowercase/title case is left alone (`answer: int = 5`). */
const LABEL_PREFIX = /^(\s*)(?:REPLY|ANSWER|OUTPUT|CODE(?: BLOCK)?|CORRECTION|CORRECTED(?: LINE| CODE)?|FIXED(?: LINE| CODE)?)\s*:\s*/;
/** The example format echoed back on one line: "TARGET: x => REPLY: y" / "x -> y". */
const ECHOED_PAIR = /=>\s*REPLY\s*:\s*(.*)$/;
const LEADING_ARROW = /^(\s*)(?:->|=>|→)\s+/;

/**
 * Remove labels a model added around its answer, keeping the code: "REPLY:\n    return x" → "    return x",
 * "    totl = 0\n\nCorrection:\n    total = 0" → "    total = 0", "REPLY: print(x)" → "print(x)".
 */
export function stripReplyLabels(text: string): string {
  let lines = text.split("\n");
  const lastLabel = lines.map((line) => LABEL_ONLY.test(line)).lastIndexOf(true);
  if (lastLabel >= 0) {
    lines = lines.slice(lastLabel + 1);
  }
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first >= 0) {
    const echoed = lines[first].match(ECHOED_PAIR);
    lines[first] = echoed
      ? echoed[1]
      : lines[first].replace(LABEL_PREFIX, "$1").replace(LEADING_ARROW, "$1");
  }
  return lines.join("\n");
}

/** Non-empty lines from model output; [] for UNCHANGED or blank. */
export function modelLines(response: string): string[] {
  const text = stripReplyLabels(normalizeModelText(response));
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
 * Reattach the buffer's leading whitespace on the first line. Models often
 * strip Enter auto-indent; the IDE indent is authoritative for typo fixes.
 */
export function preserveLeadingIndent(original: string, corrected: string): string {
  const lead = original.match(/^[ \t]*/)?.[0] ?? "";
  const lines = corrected.split("\n");
  if (lines.length === 0) {
    return corrected;
  }
  lines[0] = lead + lines[0].replace(/^[ \t]*/, "");
  return lines.join("\n");
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

/**
 * Caveman-safe merge: keep original code on each line; append only a trailing
 * comment taken from the model line when the code portion still matches.
 * Returns undefined if the model rewrote code on any line.
 */
export function mergeCavemanComments(
  original: string,
  modelText: string,
  profile: LanguageProfile
): string | undefined {
  const origLines = original.split("\n").map((line) => line.replace(/\r$/, ""));
  const modelLinesArr = modelText.split("\n");
  if (origLines.length !== modelLinesArr.length) {
    return undefined;
  }
  const prefixes = profile.lineCommentPrefixes;
  const out: string[] = [];
  for (let i = 0; i < origLines.length; i++) {
    const o = origLines[i];
    const m = modelLinesArr[i];
    const oCode = stripTrailingLineComment(o, prefixes);
    const mCode = stripTrailingLineComment(m, prefixes);
    if (oCode.trim() !== mCode.trim()) {
      return undefined;
    }
    const commentPart = m.slice(stripTrailingLineComment(m, prefixes).length);
    if (!commentPart.trim()) {
      out.push(o);
      continue;
    }
    // Preserve original indentation/code; attach model comment suffix.
    const base = oCode.length > 0 ? oCode : o.replace(/\s+$/, "");
    if (commentPart.startsWith(" ") || commentPart.startsWith("\t")) {
      out.push(base + commentPart);
    } else {
      out.push(`${base} ${commentPart}`);
    }
  }
  return out.join("\n");
}

/** Preserve whole code lines in order; allow only documentation as extra lines. */
export function docsPreservesCode(original: string, result: string, profile: LanguageProfile): boolean {
  const isLineComment = (line: string): boolean =>
    profile.lineCommentPrefixes.some((prefix) => line.trimStart().startsWith(prefix));
  const code = original.split("\n").map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !isLineComment(line));
  let next = 0;
  let closing: string | undefined;
  let insertedBlock = false;
  for (const line of result.split("\n").map((line) => line.trimEnd())) {
    const trimmed = line.trimStart();
    const matched: boolean = !insertedBlock && next < code.length && line === code[next];
    if (matched) {
      next++;
    }
    if (closing) {
      const end = trimmed.indexOf(closing);
      if (end >= 0) {
        const suffix = trimmed.slice(end + closing.length);
        if (!matched && suffix.trim() && !isLineComment(suffix)) {
          return false;
        }
        closing = undefined;
        insertedBlock = false;
      }
      continue;
    }
    if (!trimmed || isLineComment(line)) {
      continue;
    }
    const triple = profile.id === "python" ? trimmed.match(/^(\x22{3}|\x27{3})/)?.[0] : undefined;
    const opener = triple ?? (trimmed.startsWith("/*") ? "/*" : undefined);
    if (!opener) {
      if (!matched) {
        return false;
      }
      continue;
    }
    const delimiter = triple ?? "*/";
    const end = trimmed.indexOf(delimiter, opener.length);
    if (end < 0) {
      closing = delimiter;
      insertedBlock = !matched;
    } else {
      const suffix = trimmed.slice(end + delimiter.length);
      if (!matched && suffix.trim() && !isLineComment(suffix)) {
        return false;
      }
    }
  }
  return next === code.length && closing === undefined;
}
