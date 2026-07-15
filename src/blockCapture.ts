import * as vscode from "vscode";
import { cfg } from "./config";
import { PROFILES, LanguageProfile } from "./languages";

/**
 * Block capture + staging: highlight a range in the editor before LLM submission.
 * LLM execution lives in StagedExecutor.
 */
export class BlockCapture implements vscode.Disposable {
  private recording = false;
  private keyboardAdjust = false;
  private startPosition: vscode.Position | undefined;
  private headPosition: vscode.Position | undefined;
  private captureDocUri: string | undefined;
  private stagedRange: vscode.Range | undefined;
  private stagedDocUri: string | undefined;
  private readonly captureDecoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output: vscode.OutputChannel) {
    this.captureDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(100, 200, 100, 0.1)",
      isWholeLine: true,
      border: "1px dashed rgba(100, 200, 100, 0.4)",
    });
    this.disposables.push(
      this.captureDecoration,
      vscode.window.onDidChangeTextEditorSelection((e) => this.onSelectionChange(e)),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (this.recording && doc.uri.toString() === this.captureDocUri) {
          this.resetRecording();
        }
        if (doc.uri.toString() === this.stagedDocUri) {
          this.clearStaged();
        }
      })
    );
  }

  startKeyboardCapture(editor: vscode.TextEditor): boolean {
    if (!this.profileFor(editor)) {
      return false;
    }
    this.clearStaged();
    this.beginCapture(editor, editor.selection.active, true);
    this.output.appendLine(
      `[block] keyboard capture at ${editor.document.fileName}:${this.startPosition!.line + 1}`
    );
    return true;
  }

  isKeyboardCapture(): boolean {
    return this.recording && this.keyboardAdjust;
  }

  hasStagedBlock(): boolean {
    return this.stagedRange !== undefined;
  }

  stageFromSelection(editor: vscode.TextEditor): boolean {
    if (!this.profileFor(editor)) {
      return false;
    }
    if (editor.selection.isEmpty) {
      vscode.window.setStatusBarMessage("Autocorrect: select a block to stage", 3000);
      return false;
    }
    return this.stageRange(editor, editor.selection);
  }

  stageLineNearCursor(editor: vscode.TextEditor): boolean {
    if (!this.profileFor(editor)) {
      return false;
    }
    const doc = editor.document;
    let line = editor.selection.active.line;
    if (!editor.selection.isEmpty) {
      line = editor.selection.start.line;
    } else if (doc.lineAt(line).text.trim().length === 0) {
      line--;
      while (line >= 0 && doc.lineAt(line).text.trim().length === 0) {
        line--;
      }
    }
    if (line < 0) {
      vscode.window.setStatusBarMessage("Autocorrect: no line to stage", 3000);
      return false;
    }
    return this.stageRange(editor, doc.lineAt(line).range);
  }

  stageRange(editor: vscode.TextEditor, range: vscode.Range): boolean {
    const full = this.fullLines(editor.document, range);
    this.stagedRange = full;
    this.stagedDocUri = editor.document.uri.toString();
    editor.selection = new vscode.Selection(full.start, full.end);
    this.paintStaged(editor);
    const lines = full.end.line - full.start.line + 1;
    this.output.appendLine(
      `[block] staged ${editor.document.fileName}:${full.start.line + 1}-${full.end.line + 1}`
    );
    vscode.window.setStatusBarMessage(`Autocorrect: staged ${lines} line(s)`, 4000);
    return true;
  }

  finishKeyboardCapture(): boolean {
    const editor = this.captureEditor() ?? vscode.window.activeTextEditor;
    if (!editor || !this.recording || !this.startPosition) {
      return false;
    }
    if (editor.document.uri.toString() !== this.captureDocUri) {
      this.cancelCapture();
      return false;
    }
    const ok = this.stageRange(editor, this.captureRange(editor));
    this.resetRecording();
    return ok;
  }

  getStagedRange(editor: vscode.TextEditor): vscode.Range | undefined {
    if (!this.stagedRange || editor.document.uri.toString() !== this.stagedDocUri) {
      return undefined;
    }
    return this.stagedRange;
  }

  clearStaged(): void {
    this.stagedRange = undefined;
    this.stagedDocUri = undefined;
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.captureDecoration, []);
    }
  }

  cancelCapture(): void {
    this.resetRecording();
    this.clearStaged();
    vscode.window.setStatusBarMessage("Autocorrect: capture cancelled", 3000);
    this.output.appendLine("[block] capture cancelled");
  }

  moveCaptureHead(dir: "up" | "down" | "lineStart" | "lineEnd"): void {
    const editor = this.captureEditor();
    if (!editor || !this.keyboardAdjust || !this.headPosition) {
      return;
    }
    const doc = editor.document;
    const line = this.headPosition.line;
    switch (dir) {
      case "up":
        this.headPosition = new vscode.Position(Math.max(0, line - 1), this.headPosition.character);
        break;
      case "down":
        this.headPosition = new vscode.Position(
          Math.min(doc.lineCount - 1, line + 1),
          this.headPosition.character
        );
        break;
      case "lineStart":
        this.headPosition = new vscode.Position(line, 0);
        break;
      case "lineEnd":
        this.headPosition = new vscode.Position(line, doc.lineAt(line).text.length);
        break;
    }
    this.syncHeadSelection(editor);
    this.refreshCaptureDecoration(editor);
  }

  private profileFor(editor: vscode.TextEditor): LanguageProfile | undefined {
    const profile = PROFILES[editor.document.languageId];
    if (!profile || !cfg().languages.includes(editor.document.languageId)) {
      vscode.window.setStatusBarMessage(
        `Autocorrect: unsupported language "${editor.document.languageId}"`,
        4000
      );
      return undefined;
    }
    return profile;
  }

  private beginCapture(editor: vscode.TextEditor, anchor: vscode.Position, keyboard: boolean): void {
    this.recording = true;
    this.keyboardAdjust = keyboard;
    this.startPosition = anchor;
    this.headPosition = anchor;
    this.captureDocUri = editor.document.uri.toString();
    if (keyboard) {
      this.syncHeadSelection(editor);
    }
    this.refreshCaptureDecoration(editor);
  }

  private resetRecording(): void {
    this.recording = false;
    this.keyboardAdjust = false;
    this.startPosition = undefined;
    this.headPosition = undefined;
    this.captureDocUri = undefined;
  }

  private captureEditor(): vscode.TextEditor | undefined {
    if (!this.captureDocUri) {
      return undefined;
    }
    return vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === this.captureDocUri
    );
  }

  private syncHeadSelection(editor: vscode.TextEditor): void {
    if (!this.headPosition) {
      return;
    }
    const pos = this.headPosition;
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
  }

  private captureRange(editor: vscode.TextEditor): vscode.Range {
    const a = this.startPosition ?? editor.selection.active;
    const b =
      this.keyboardAdjust && this.headPosition ? this.headPosition : editor.selection.active;
    return a.isBeforeOrEqual(b) ? new vscode.Range(a, b) : new vscode.Range(b, a);
  }

  private onSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    if (!this.recording || e.textEditor.document.uri.toString() !== this.captureDocUri) {
      return;
    }
    if (this.keyboardAdjust) {
      return;
    }
    this.refreshCaptureDecoration(e.textEditor);
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    if (!this.recording || e.document.uri.toString() !== this.captureDocUri) {
      return;
    }
    const editor = this.captureEditor();
    if (editor) {
      this.refreshCaptureDecoration(editor);
    }
  }

  private refreshCaptureDecoration(editor: vscode.TextEditor): void {
    editor.setDecorations(this.captureDecoration, [this.fullLines(editor.document, this.captureRange(editor))]);
  }

  private paintStaged(editor: vscode.TextEditor): void {
    if (!this.stagedRange) {
      return;
    }
    editor.setDecorations(this.captureDecoration, [this.stagedRange]);
  }

  private fullLines(doc: vscode.TextDocument, range: vscode.Range): vscode.Range {
    return new vscode.Range(
      range.start.line, 0,
      range.end.line, doc.lineAt(range.end.line).text.length
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
