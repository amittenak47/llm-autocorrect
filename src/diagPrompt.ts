export interface PromptDiag {
  line: number;
  character: number;
  message: string;
  severity: number;
}

const heading = "Diagnostics (from the language server):";

function message(diag: PromptDiag): string {
  return diag.message.split(/\r?\n/, 1)[0].slice(0, 160);
}

export function formatDiagnosticsForLine(target: number, diags: PromptDiag[]): string {
  const entries = diags.filter((d) => d.severity <= 1 && Math.abs(d.line - target) <= 3)
    .sort((a, b) => Math.abs(a.line - target) - Math.abs(b.line - target) || a.line - b.line || a.character - b.character)
    .slice(0, 6)
    .map((d) => {
      const distance = Math.abs(d.line - target);
      const relative = d.line < target ? "above" : "below";
      const label = distance === 0 ? `TARGET line, col ${d.character + 1}`
        : distance === 1 ? `line ${relative} the target` : `${distance} lines ${relative} the target`;
      return `- ${label}: ${message(d)}`;
    });
  return entries.length ? [heading, ...entries].join("\n") : "";
}

export function formatDiagnosticsForBlock(start: number, end: number, diags: PromptDiag[]): string {
  const entries = diags.filter((d) => d.severity <= 1 && d.line >= start && d.line <= end)
    .sort((a, b) => a.line - b.line || a.character - b.character)
    .slice(0, 6)
    .map((d) => `- block line ${d.line - start + 1}, col ${d.character + 1}: ${message(d)}`);
  return entries.length ? [heading, ...entries].join("\n") : "";
}

export function lineFixExamples(languageId: string): string {
  const examples = languageId === "python" ? [
    ['pritn("hi")', 'print("hi")'],
    ["defn add(a, b):", "def add(a, b):"],
    ["for i in range(10)", "for i in range(10):"],
    ["retrun total", "return total"],
    ["x = compute(a, b)", "UNCHANGED"],
  ] : [
    ["consle.log(x);", "console.log(x);"],
    ["retrun x;", "return x;"],
    ["if (a > b {", "if (a > b) {"],
    ["cosnt n = 1;", "const n = 1;"],
    ["int total = a + b;", "UNCHANGED"],
  ];
  return examples.map(([target, reply]) => `TARGET: ${target} => REPLY: ${reply}`).join("\n");
}
