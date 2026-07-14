import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { blockMaxTokens } from "./blockMath";
import { cfg } from "./config";
import { Flash } from "./flash";
import { PROFILES, LanguageProfile } from "./languages";
import { LlmClient, stripFences } from "./llm";
import { StatusBar } from "./statusBar";

type CommentStyle = "docs" | "caveman";

/**
 * On-demand documentation:
 *  - "docs": docstrings/comment blocks for the target code.
 *  - "caveman": ultra-short inline comments ("# get user", "// loop nums").
 *
 * Target priority: selection → active block capture → previous non-blank line.
 */
export class Commenter {
  constructor(
    private readonly llm: LlmClient,
    private readonly blockCapture: BlockCapture,
    private readonly statusBar: StatusBar,
    private readonly flash: Flash,
    private readonly output: vscode.OutputChannel
  ) {}

  async documentBlock(): Promise<void> {
    await this.run("docs");
  }

  async cavemanComment(): Promise<void> {
    await this.run("caveman");
  }

  /** Selection, else the block being captured, else the previous non-blank line. */
  private resolveTarget(editor: vscode.TextEditor): vscode.Range | undefined {
    const doc = editor.document;
    let range: vscode.Range | undefined;
    if (!editor.selection.isEmpty) {
      range = editor.selection;
    } else {
      range = this.blockCapture.activeCaptureRange(editor);
    }
    if (range) {
      return new vscode.Range(
        range.start.line, 0,
        range.end.line, doc.lineAt(range.end.line).text.length
      );
    }
    let line = editor.selection.active.line - 1;
    while (line >= 0 && doc.lineAt(line).text.trim().length === 0) {
      line--;
    }
    if (line < 0) {
      return undefined;
    }
    return doc.lineAt(line).range;
  }

  private systemPrompt(style: CommentStyle, profile: LanguageProfile): string {
    const prefix = profile.lineCommentPrefixes[0];
    if (style === "caveman") {
      return (
        `You add caveman-style comments to ${profile.name} code: ultra-short inline comments ` +
        `of 2-4 lowercase words, e.g. "${prefix} get user" or "${prefix} loop nums". ` +
        `Append one to the end of each line that does real work; skip blank lines and lines ` +
        `that already have a comment. ` +
        `Never change the code itself, the line order, or the number of lines. ` +
        `Reply with ONLY the resulting code — no explanations, no code fences.`
      );
    }
    return (
      `You document ${profile.name} code. Return the EXACT same code with documentation added: ` +
      `a docstring for each function/class if ${profile.name} has docstrings, otherwise a ` +
      `comment block above it, and a brief "${prefix}" comment above other significant code. ` +
      `Never change, reorder, or reformat the code itself — only insert documentation. ` +
      `Preserve the original indentation. ` +
      `Reply with ONLY the resulting code — no explanations, no code fences.`
    );
  }

  private async run(style: CommentStyle): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("Autocorrect: open a file first.");
      return;
    }
    const profile = PROFILES[editor.document.languageId];
    if (!profile || !cfg().languages.includes(editor.document.languageId)) {
      void vscode.window.showInformationMessage(
        `Autocorrect: unsupported or disabled language "${editor.document.languageId}".`
      );
      return;
    }
    const range = this.resolveTarget(editor);
    if (!range) {
      void vscode.window.showInformationMessage(
        "Autocorrect: nothing to comment — select code or put the cursor below a line."
      );
      return;
    }
    const doc = editor.document;
    const text = doc.getText(range);
    if (text.trim().length === 0) {
      void vscode.window.showInformationMessage("Autocorrect: the target block is empty.");
      return;
    }

    this.output.appendLine(
      `[comment] ${style} for ${doc.fileName}:${range.start.line + 1}-${range.end.line + 1}`
    );

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.llm.complete({
          system: this.systemPrompt(style, profile),
          user: text,
          maxTokens: blockMaxTokens(text),
          signal: new AbortController().signal,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[comment] ${msg}`);
      void vscode.window.showErrorMessage(`Autocorrect: commenting failed — ${msg}`);
      return;
    }

    const commented = stripFences(response).replace(/\r?\n$/, "");
    if (commented.trim().length === 0 || commented === text) {
      vscode.window.setStatusBarMessage("Autocorrect: no comments were added", 3000);
      return;
    }
    // Caveman comments are inline-only — a changed line count means the model rewrote code.
    if (style === "caveman" && commented.split("\n").length !== text.split("\n").length) {
      void vscode.window.showWarningMessage(
        "Autocorrect: the model changed the line structure — not applying."
      );
      return;
    }
    // Re-validate the buffer: the target must be untouched since the request went out.
    if (doc.isClosed || doc.getText(range) !== text) {
      void vscode.window.showWarningMessage(
        "Autocorrect: the code changed while commenting — not applying."
      );
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, range, commented);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      const addedLines = commented.split("\n").length - text.split("\n").length;
      this.output.appendLine(
        `[comment] ${doc.fileName}:${range.start.line + 1} ${style} applied (+${addedLines} lines)`
      );
      this.flash.show(
        editor,
        new vscode.Range(range.start.line, 0, range.end.line + Math.max(0, addedLines), 0)
      );
    }
  }
}
