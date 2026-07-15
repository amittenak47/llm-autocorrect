import * as vscode from "vscode";
import { blockMaxTokens } from "./blockMath";
import { cfg } from "./config";
import { Flash } from "./flash";
import { PROFILES, LanguageProfile } from "./languages";
import { LlmClient, stripFences } from "./llm";
import { estimateTokens } from "./promptLimits";
import { StatusBar } from "./statusBar";

/**
 * Block capture: stage exactly what gets sent to the LLM before a request goes out.
 * No popup window — the block lives in the editor and a faint decoration marks it.
 *
 * Two modes:
 *  - Reverse: select code, run "Correct Selected Block" — the selection is the block.
 *  - Advance: "Start Block Capture", type, "End Block Capture & Correct" — the range
 *    from the start mark to the cursor is the block, highlighted while you type.
 */
export class BlockCapture implements vscode.Disposable {
  private recording = false;
  private keyboardAdjust = false;
  private startPosition: vscode.Position | undefined;
  private headPosition: vscode.Position | undefined;
  private captureDocUri: string | undefined;
  private readonly captureDecoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly llm: LlmClient,
    private readonly statusBar: StatusBar,
    private readonly flash: Flash,
    private readonly output: vscode.OutputChannel
  ) {
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
          this.reset();
        }
      })
    );
  }

  private profileFor(editor: vscode.TextEditor): LanguageProfile | undefined {
    const profile = PROFILES[editor.document.languageId];
    if (!profile || !cfg().languages.includes(editor.document.languageId)) {
      void vscode.window.showInformationMessage(
        `Autocorrect: unsupported or disabled language "${editor.document.languageId}".`
      );
      return undefined;
    }
    return profile;
  }

  /** Reverse mode: the native selection is the block. */
  async correctBlock(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showInformationMessage("Autocorrect: select the block to correct first.");
      return;
    }
    const profile = this.profileFor(editor);
    if (!profile) {
      return;
    }
    await this.correctRange(editor, editor.selection, profile);
  }

  /** Advance mode: remember where the block starts and highlight it as it grows. */
  startCapture(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Autocorrect: open a file to start a block capture.");
      return;
    }
    if (!this.profileFor(editor)) {
      return;
    }
    this.beginCapture(editor, editor.selection.active, false);
    vscode.window.setStatusBarMessage(
      "Autocorrect: block capture started — type, then End Block Capture & Correct",
      5000
    );
    this.output.appendLine(
      `[block] capture started at ${editor.document.fileName}:${this.startPosition!.line + 1}`
    );
  }

  /** Keyboard capture: anchor at cursor, move the far end with WASD. */
  startKeyboardCapture(editor: vscode.TextEditor): boolean {
    if (!this.profileFor(editor)) {
      return false;
    }
    this.beginCapture(editor, editor.selection.active, true);
    this.output.appendLine(
      `[block] keyboard capture at ${editor.document.fileName}:${this.startPosition!.line + 1}`
    );
    return true;
  }

  isKeyboardCapture(): boolean {
    return this.keyboardAdjust;
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
    this.refreshDecoration(editor);
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
    this.refreshDecoration(editor);
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

  /** Advance mode: extract start→cursor, clear the highlight, send the block. */
  async endCapture(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!this.recording || !this.startPosition) {
      void vscode.window.showInformationMessage("Autocorrect: no block capture in progress.");
      return;
    }
    if (!editor || editor.document.uri.toString() !== this.captureDocUri) {
      void vscode.window.showWarningMessage(
        "Autocorrect: block capture was started in a different file — capture cancelled."
      );
      this.reset();
      return;
    }
    const profile = this.profileFor(editor);
    if (!profile) {
      this.reset();
      return;
    }
    const range = this.captureRange(editor);
    this.reset();
    editor.setDecorations(this.captureDecoration, []);
    await this.correctRange(editor, range, profile);
  }

  cancelCapture(): void {
    if (!this.recording) {
      return;
    }
    this.reset();
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.captureDecoration, []);
    }
    vscode.window.setStatusBarMessage("Autocorrect: block capture cancelled", 3000);
    this.output.appendLine("[block] capture cancelled");
  }

  /** The block being recorded in this editor, if any — used by the commenter commands. */
  activeCaptureRange(editor: vscode.TextEditor): vscode.Range | undefined {
    if (!this.recording || editor.document.uri.toString() !== this.captureDocUri) {
      return undefined;
    }
    return this.captureRange(editor);
  }

  private reset(): void {
    this.recording = false;
    this.keyboardAdjust = false;
    this.startPosition = undefined;
    this.headPosition = undefined;
    this.captureDocUri = undefined;
  }

  /** Anchor to head, order-normalized. */
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
    this.refreshDecoration(e.textEditor);
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    if (!this.recording || e.document.uri.toString() !== this.captureDocUri) {
      return;
    }
    const editor = vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === this.captureDocUri
    );
    if (editor) {
      this.refreshDecoration(editor);
    }
  }

  private refreshDecoration(editor: vscode.TextEditor): void {
    editor.setDecorations(this.captureDecoration, [this.captureRange(editor)]);
  }

  /** Whole lines covered by the range — matches what the whole-line decoration showed. */
  private fullLines(doc: vscode.TextDocument, range: vscode.Range): vscode.Range {
    return new vscode.Range(
      range.start.line, 0,
      range.end.line, doc.lineAt(range.end.line).text.length
    );
  }

  private async correctRange(
    editor: vscode.TextEditor, range: vscode.Range, profile: LanguageProfile
  ): Promise<void> {
    const doc = editor.document;
    const blockRange = this.fullLines(doc, range);
    const text = doc.getText(blockRange);
    if (text.trim().length === 0) {
      void vscode.window.showInformationMessage("Autocorrect: the captured block is empty.");
      return;
    }

    if (cfg().blockConfirm) {
      const lines = blockRange.end.line - blockRange.start.line + 1;
      const tokens = estimateTokens(text);
      const choice = await vscode.window.showInformationMessage(
        `Autocorrect: send ${lines} line${lines === 1 ? "" : "s"} (~${tokens} tokens) to ${cfg().provider}?`,
        "Send",
        "Cancel"
      );
      if (choice !== "Send") {
        return;
      }
    }

    this.output.appendLine(
      `[block] calling LLM for ${doc.fileName}:${blockRange.start.line + 1}-${blockRange.end.line + 1}`
    );

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.llm.complete({
          system:
            `You are a strict code autocorrector for ${profile.name}. ` +
            `The user sends one block of code. Fix typos and syntax errors only. ` +
            `Preserve line structure, indentation, comments, and style. ` +
            `Never rewrite working code stylistically — fix mistakes only. ` +
            `If the block is already correct, reply with exactly: UNCHANGED\n` +
            `Reply with ONLY the corrected code — no explanations, no code fences.`,
          user: text,
          maxTokens: blockMaxTokens(text),
          signal: new AbortController().signal,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[block] ${msg}`);
      void vscode.window.showErrorMessage(`Autocorrect: block correction failed — ${msg}`);
      return;
    }

    const corrected = stripFences(response).replace(/\r?\n$/, "");
    if (corrected.trim() === "UNCHANGED" || corrected === text) {
      vscode.window.setStatusBarMessage("Autocorrect: block already looks correct", 3000);
      return;
    }
    if (corrected.trim().length === 0) {
      void vscode.window.showWarningMessage("Autocorrect: the model returned no code — not applying.");
      return;
    }
    // Re-validate the buffer: the block must be untouched since the request went out.
    if (doc.isClosed || doc.getText(blockRange) !== text) {
      void vscode.window.showWarningMessage(
        "Autocorrect: the block changed while correcting — not applying."
      );
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, blockRange, corrected);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      this.output.appendLine(
        `[block] ${doc.fileName}:${blockRange.start.line + 1}-${blockRange.end.line + 1} corrected`
      );
      this.flash.show(editor, new vscode.Range(blockRange.start.line, 0, blockRange.end.line, 0));
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
