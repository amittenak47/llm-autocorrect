import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { blockLineRange } from "./blockApply";
import { activeLlmProfile, cfg } from "./config";
import { PROFILES } from "./languages";
import { StagedExecutor } from "./stagedExecutor";
import { StagedOp } from "./stagedSession";

/** Palette commands for docs / caveman on selection or staged block. */
export class Commenter {
  constructor(
    private readonly stagedExecutor: StagedExecutor,
    private readonly blockCapture: BlockCapture
  ) {}

  async documentBlock(queue = false): Promise<void> {
    await this.run("docs", queue);
  }

  async cavemanComment(queue = false): Promise<void> {
    await this.run("caveman", queue);
  }

  private resolveRange(editor: vscode.TextEditor): vscode.Range | undefined {
    const staged = this.blockCapture.getStagedRange(editor);
    if (staged) {
      return staged;
    }
    if (!editor.selection.isEmpty) {
      const doc = editor.document;
      const r = editor.selection;
      return blockLineRange(doc, r.start.line, r.end.line);
    }
    const doc = editor.document;
    let line = editor.selection.active.line - 1;
    while (line >= 0 && doc.lineAt(line).text.trim().length === 0) {
      line--;
    }
    if (line < 0) {
      return undefined;
    }
    return doc.lineAt(line).range;
  }

  private async run(op: StagedOp, queue: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
      return;
    }
    if (!PROFILES[editor.document.languageId] || !cfg().languages.includes(editor.document.languageId)) {
      vscode.window.setStatusBarMessage(
        `Autocorrect: unsupported language "${editor.document.languageId}"`,
        4000
      );
      return;
    }
    const range = this.resolveRange(editor);
    if (!range) {
      vscode.window.setStatusBarMessage(
        "Autocorrect: select code, stage a block (S→E), or put cursor below a line",
        5000
      );
      return;
    }
    const result = await this.stagedExecutor.run(
      editor,
      range,
      {
        op,
        contextNote: "",
        tiers: cfg().defaultTiers,
        profileId: activeLlmProfile().id,
      },
      queue
    );
    if (result.ok) {
      this.blockCapture.clearStaged();
    }
  }
}
