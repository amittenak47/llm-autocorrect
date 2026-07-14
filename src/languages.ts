// Per-language configuration (Phase 4). Adding a language = adding an entry here
// plus its ID in the `autocorrect.languages` setting.

export interface LanguageProfile {
  /** VS Code language ID */
  id: string;
  /** Human name used in prompts ("Python", "C++") */
  name: string;
  /** Line-comment prefixes, used by the pre-filter to skip comment lines */
  lineCommentPrefixes: string[];
}

export const PROFILES: Record<string, LanguageProfile> = {
  python: { id: "python", name: "Python", lineCommentPrefixes: ["#"] },
  go: { id: "go", name: "Go", lineCommentPrefixes: ["//"] },
  java: { id: "java", name: "Java", lineCommentPrefixes: ["//"] },
  c: { id: "c", name: "C", lineCommentPrefixes: ["//"] },
  cpp: { id: "cpp", name: "C++", lineCommentPrefixes: ["//"] },
  rust: { id: "rust", name: "Rust", lineCommentPrefixes: ["//"] },
  zig: { id: "zig", name: "Zig", lineCommentPrefixes: ["//"] },
  javascript: { id: "javascript", name: "JavaScript", lineCommentPrefixes: ["//"] },
  typescript: { id: "typescript", name: "TypeScript", lineCommentPrefixes: ["//"] },
};

export interface DetectedLanguage {
  profile: LanguageProfile;
  score: number;
}

/**
 * Cheap heuristic: which language does this pasted snippet look like?
 * Only needs to be good enough to decide "this is not the file's language" —
 * the user confirms before anything is replaced.
 */
export function detectLanguage(text: string): DetectedLanguage | undefined {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return undefined;
  }
  const semiLines = lines.filter((l) => /;\s*$/.test(l.trim())).length;
  const semiRatio = semiLines / lines.length;

  const scores: Record<string, number> = {
    python: 0, go: 0, java: 0, c: 0, cpp: 0, rust: 0, javascript: 0, typescript: 0,
  };

  // Python: colon-terminated blocks, def/elif, no semicolons or braces
  if (/^\s*def\s+\w+\s*\(/m.test(text)) scores.python += 3;
  if (/^\s*(elif|except)\b/m.test(text)) scores.python += 3;
  if (/^\s*(if|for|while|class|def)\b[^;{]*:\s*$/m.test(text)) scores.python += 2;
  if (/^\s*(import\s+\w+|from\s+[\w.]+\s+import)\b\s*$/m.test(text) === false &&
      /^(import\s+\w+|from\s+[\w.]+\s+import\s+)/m.test(text)) scores.python += 2;
  if (semiRatio < 0.1 && !text.includes("{")) scores.python += 1;

  // C / C++
  if (/#include\s*[<"]/.test(text)) { scores.c += 3; scores.cpp += 3; }
  if (/\bstd::|::\s*\w+|\bcout\b|\bcin\b|\btemplate\s*</.test(text)) scores.cpp += 4;
  if (/\bint\s+main\s*\(/.test(text)) { scores.c += 2; scores.cpp += 2; }
  if (/\b(printf|malloc|free)\s*\(/.test(text)) scores.c += 2;
  if (/\bfor\s*\(\s*(int|size_t|auto)\s+\w+\s*=/.test(text)) { scores.cpp += 2; scores.c += 1; }

  // Java
  if (/\b(public|private|protected)\s+(static\s+)?(void|class|int|String)\b/.test(text)) scores.java += 3;
  if (/\bSystem\.out\.print/.test(text)) scores.java += 4;
  if (/^import\s+java\./m.test(text)) scores.java += 4;

  // Go
  if (/\bfunc\s+\w+\s*\(/.test(text)) scores.go += 3;
  if (/^\s*package\s+\w+\s*$/m.test(text)) scores.go += 3;
  if (/:=/.test(text)) scores.go += 2;
  if (/\bfmt\.\w+\(/.test(text)) scores.go += 3;

  // Rust
  if (/\bfn\s+\w+\s*\(/.test(text)) scores.rust += 3;
  if (/\blet\s+mut\b/.test(text)) scores.rust += 3;
  if (/\bprintln!\s*\(/.test(text)) scores.rust += 4;
  if (/->\s*\w+\s*\{/.test(text)) scores.rust += 1;

  // JavaScript / TypeScript
  if (/\b(const|let)\s+\w+\s*=/.test(text)) { scores.javascript += 2; scores.typescript += 1; }
  if (/=>\s*[{(]/.test(text)) { scores.javascript += 2; scores.typescript += 1; }
  if (/\bconsole\.log\s*\(/.test(text)) { scores.javascript += 3; scores.typescript += 2; }
  if (/:\s*(string|number|boolean|void)\b/.test(text) || /\binterface\s+\w+\s*\{/.test(text)) scores.typescript += 4;

  // Generic C-family signal: braces + semicolons
  if (semiRatio > 0.3 && text.includes("{")) {
    for (const id of ["c", "cpp", "java", "javascript", "typescript", "rust"]) {
      scores[id] += 1;
    }
  }

  let best: DetectedLanguage | undefined;
  for (const [id, score] of Object.entries(scores)) {
    if (!best || score > best.score) {
      best = { profile: PROFILES[id], score };
    }
  }
  return best && best.score >= 4 ? best : undefined;
}

export function isCommentOrBlank(line: string, profile: LanguageProfile): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return profile.lineCommentPrefixes.some((p) => trimmed.startsWith(p));
}
