import * as vscode from "vscode";

/** Subtle 2-second highlight so the user notices where an edit landed. */
export class Flash implements vscode.Disposable {
  private readonly decoration: vscode.TextEditorDecorationType;

  constructor() {
    this.decoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
    });
  }

  show(editor: vscode.TextEditor, range: vscode.Range): void {
    editor.setDecorations(this.decoration, [range]);
    setTimeout(() => {
      if (!editor.document.isClosed) {
        editor.setDecorations(this.decoration, []);
      }
    }, 2000);
  }

  dispose(): void {
    this.decoration.dispose();
  }
}
