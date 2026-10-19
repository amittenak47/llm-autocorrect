/** Pure helpers for assembling LLM user prompts (no vscode dependency). */

export function mergedContextNotes(global: string, ...notes: (string | undefined)[]): string {
  const parts = [global.trim(), ...notes.map((n) => n?.trim() ?? "")].filter(
    (p) => p.length > 0
  );
  return parts.join("\n\n");
}

export function formatUserContext(body: string, context: string): string {
  if (!context) {
    return body;
  }
  return `User context (for understanding only):\n${context}\n\n${body}`;
}

/** Staged context note — treat as an instruction to apply inside the CODE block. */
export function formatUserInstruction(body: string, instruction: string): string {
  const note = instruction.trim();
  if (!note) {
    return body;
  }
  return `INSTRUCTION (apply this change to the CODE block):\n${note}\n\n${body}`;
}

/** Pure fix-message bodies; names precede any language-server diagnostics. */
export function lineFixBody(
  contextLines: string, targetLine: string, diagnostics?: string, names?: string[], multiline = false
): string {
  const body =
    `Context (surrounding code; the line ">>> TARGET LINE <<<" marks where the TARGET ${multiline ? "lines sit" : "line sits"}):\n${contextLines || "(start of file)"}\n\n` +
    `TARGET ${multiline ? "lines" : "line"}:\n${targetLine}`;
  return appendFixDetails(body, names, diagnostics);
}

export function blockFixBody(code: string, diagnostics?: string, names?: string[]): string {
  // `code` is already labelled by formatBlockWithContext ("CODE block …").
  return appendFixDetails(code, names, diagnostics);
}

function appendFixDetails(body: string, names?: string[], diagnostics?: string): string {
  if (names?.length) body += `\n\nNames defined in this file: ${names.join(", ")}`;
  if (diagnostics?.trim()) body += `\n\n${diagnostics}`;
  return body;
}
