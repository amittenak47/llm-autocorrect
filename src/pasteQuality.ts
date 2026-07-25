/** Pure helpers for paste-translate quality checks (no vscode). */

const COMMON_STOP = new Set([
  "int",
  "void",
  "main",
  "return",
  "true",
  "false",
  "null",
  "nullptr",
  "auto",
  "const",
  "static",
  "public",
  "private",
  "class",
  "struct",
  "include",
  "using",
  "namespace",
  "std",
  "cout",
  "cin",
  "endl",
  "printf",
  "println",
  "print",
  "def",
  "elif",
  "except",
  "import",
  "from",
  "pass",
  "None",
  "True",
  "False",
  "self",
  "func",
  "package",
  "fmt",
  "fn",
  "let",
  "mut",
  "var",
  "function",
  "console",
  "log",
  "string",
  "number",
  "boolean",
]);

/** Significant identifiers (≥3 chars), excluding common keywords. */
export function significantIdentifiers(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g)) {
    if (!COMMON_STOP.has(m[0])) {
      out.add(m[0]);
    }
  }
  return out;
}

/** String / char literal payloads (inner text), roughly. */
export function stringLiterals(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    const inner = (m[1] ?? m[2] ?? "").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    if (inner.length > 0) {
      out.push(inner);
    }
  }
  return out;
}

/**
 * True when the translation likely ignored the source (e.g. invented `greet`
 * for a `main`/`cout` snippet). Used to block bad local-model replies.
 */
export function looksLikeFaithfulTranslation(source: string, translated: string): boolean {
  const src = source.trim();
  const dst = translated.trim();
  if (!src || !dst) {
    return false;
  }

  const srcStrings = stringLiterals(src);
  if (srcStrings.length > 0) {
    const kept = srcStrings.some((s) => dst.includes(s));
    if (!kept) {
      return false;
    }
  }

  const srcIds = significantIdentifiers(src);
  const dstIds = significantIdentifiers(dst);
  let novel = 0;
  for (const id of dstIds) {
    if (!srcIds.has(id)) {
      novel++;
    }
  }
  // Small snippets: inventing multiple new names is almost always hallucination.
  const srcLines = src.split(/\r?\n/).filter((l) => l.trim()).length;
  if (srcLines <= 5 && novel >= 2 && srcIds.size <= 2) {
    return false;
  }
  if (novel >= 4 && novel > srcIds.size + 1) {
    return false;
  }
  return true;
}
