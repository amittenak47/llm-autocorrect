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
