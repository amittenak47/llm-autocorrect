import { stringLiterals } from "./pasteQuality";

export interface FixCheckResult {
  ok: boolean;
  reason?: string;
}

export function editDistance(a: string, b: string): number {
  if (a.length < b.length) return editDistance(b, a);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Mask literals for identifiers; remove comments only for literal preservation. */
function scan(text: string, languageId: string): { code: string; text: string; unterminated: boolean } {
  let code = "";
  let withoutComments = "";
  let quote = "";
  let escaped = false;
  let blockComment = false;
  let lineComment = false;
  const prefix = languageId === "python" ? "#" : "//";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (lineComment) {
      if (ch !== "\n") {
        code += ch;
        continue;
      }
      lineComment = false;
    }
    if (blockComment) {
      if (text.startsWith("*/", i)) {
        blockComment = false;
        code += "*/";
        i++;
      } else {
        code += ch;
        if (ch === "\n") withoutComments += "\n";
      }
      continue;
    }
    if (quote) {
      code += ch === "\n" ? "\n" : " ";
      withoutComments += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (text.startsWith(quote, i)) {
        code += " ".repeat(quote.length - 1);
        withoutComments += quote.slice(1);
        i += quote.length - 1;
        quote = "";
      }
      continue;
    }
    if (text.startsWith(prefix, i)) {
      lineComment = true;
      code += ch;
      withoutComments += " ";
      continue;
    }
    if (languageId !== "python" && text.startsWith("/*", i)) {
      blockComment = true;
      code += "/*";
      withoutComments += " ";
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = languageId === "python" && text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
      code += " ".repeat(quote.length);
      withoutComments += quote;
      i += quote.length - 1;
      continue;
    }
    code += ch;
    withoutComments += ch;
  }
  return { code, text: withoutComments, unterminated: quote !== "" && quote !== "`" };
}

export function checkFix(opts: {
  original: string; corrected: string; languageId: string;
  fileNames: Set<string>; builtins: Set<string>;
}): FixCheckResult {
  const { original, corrected, languageId, fileNames, builtins } = opts;
  const source = scan(original, languageId);
  const target = scan(corrected, languageId);
  // f-string / template placeholders ({x}, ${x}) are code, so typos inside them may be fixed.
  const literalBody = (value: string): string => value.replace(/\$?\{[^{}]*\}/g, "{}");
  const targetBody = literalBody(target.text);
  const correctedLiterals = stringLiterals(target.text).map(literalBody);
  if (!source.unterminated && stringLiterals(source.text).map(literalBody).some((literal) =>
    !targetBody.includes(literal) && !correctedLiterals.some((value) => value.includes(literal)))) {
    return { ok: false, reason: "changed string literal" };
  }
  const identifiers = (text: string): Set<string> => new Set(text.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const oldNames = identifiers(source.code);
  for (const name of identifiers(target.code)) {
    if (!oldNames.has(name) && !fileNames.has(name) && !builtins.has(name) &&
        ![...oldNames].some((old) => editDistance(old, name) <= 2)) {
      return { ok: false, reason: `invented name "${name}"` };
    }
  }
  const measured = corrected.split(/\r?\n/);
  const originalLines = original.split(/\r?\n/).length;
  while (measured.length > originalLines && /^[\s)\]};:]*$/.test(measured[measured.length - 1])) {
    measured.pop();
  }
  const candidate = measured.join("\n");
  if (original.replace(/\s/g, "").length > 12 &&
      editDistance(original, candidate) / Math.max(original.length, candidate.length) > 0.5) {
    return { ok: false, reason: "change too large" };
  }
  return { ok: true };
}
