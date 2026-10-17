import * as vscode from "vscode";

/** Full-line range covering startLine..endLine inclusive. */
export function blockLineRange(doc: vscode.TextDocument, startLine: number, endLine: number): vscode.Range {
  return new vscode.Range(
    startLine, 0,
    endLine, doc.lineAt(endLine).text.length
  );
}
