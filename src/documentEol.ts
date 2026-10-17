/** Normalize replacement text to the document's line endings. */
export function toDocumentEol(text: string, crlf: boolean): string {
  return text.replace(/\r?\n/g, crlf ? "\r\n" : "\n");
}
