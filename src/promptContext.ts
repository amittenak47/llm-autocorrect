import { cfg } from "./config";
import { formatUserContext, formatUserInstruction, mergedContextNotes } from "./promptMerge";

export { mergedContextNotes, formatUserContext, formatUserInstruction } from "./promptMerge";

/** Global prefix from settings (autocorrect.prompt.prefix). */
export function globalPromptPrefix(): string {
  return cfg().promptPrefix.trim();
}

export function sessionContext(...notes: (string | undefined)[]): string {
  return mergedContextNotes(globalPromptPrefix(), ...notes);
}

export function withUserContext(body: string, sessionNote?: string): string {
  return formatUserContext(body, sessionContext(sessionNote));
}

export function lineFixUserMessage(contextLines: string, targetLine: string): string {
  const body =
    `Context (lines above the target):\n${contextLines || "(start of file)"}\n\n` +
    `TARGET line:\n${targetLine}`;
  return withUserContext(body);
}

export function blockFixUserMessage(code: string, sessionNote?: string): string {
  const global = globalPromptPrefix();
  const note = sessionNote?.trim() ?? "";
  let body = `Code:\n${code}`;
  if (note) {
    body = formatUserInstruction(body, note);
  }
  if (global) {
    body = formatUserContext(body, global);
  }
  return body;
}
