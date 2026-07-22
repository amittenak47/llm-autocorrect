import * as vscode from "vscode";

/** Full-line range covering startLine..endLine inclusive. */
export function blockLineRange(doc: vscode.TextDocument, startLine: number, endLine: number): vscode.Range {
  return new vscode.Range(
    startLine, 0,
    endLine, doc.lineAt(endLine).text.length
  );
}

/**
 * Apply LLM text to a line block. WorkspaceEdit.replace expands or shrinks lines
 * when the response has more or fewer newlines than the original range.
 */
export function applyBlockText(
  edit: vscode.WorkspaceEdit,
  uri: vscode.Uri,
  doc: vscode.TextDocument,
  startLine: number,
  endLine: number,
  newText: string
): void {
  edit.replace(uri, blockLineRange(doc, startLine, endLine), newText);
}
