import { cfg } from "./config";
import { blockFixBody, lineFixBody, formatUserContext, formatUserInstruction, mergedContextNotes } from "./promptMerge";

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

export function lineFixUserMessage(
  contextLines: string, targetLine: string, diagnostics?: string, names?: string[], multiline = false
): string {
  return withUserContext(lineFixBody(contextLines, targetLine, diagnostics, names, multiline));
}

export function blockFixUserMessage(code: string, sessionNote?: string, diagnostics?: string, names?: string[]): string {
  const global = globalPromptPrefix();
  const note = sessionNote?.trim() ?? "";
  let body = blockFixBody(code, diagnostics, names);
  if (note) {
    body = formatUserInstruction(body, note);
  }
  if (global) {
    body = formatUserContext(body, global);
  }
  return body;
}
