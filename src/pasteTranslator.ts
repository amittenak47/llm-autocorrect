import * as vscode from "vscode";
import { cfg } from "./config";
import { withUserContext } from "./promptContext";
import { PROFILES, detectLanguage, LanguageProfile } from "./languages";
import { LlmRouter } from "./llmRouter";
import { stripFences } from "./llm";
import { StatusBar } from "./statusBar";

/** Languages close enough that offering a "translation" would be noise. */
const FAMILIES: string[][] = [
  ["c", "cpp"],
  ["javascript", "typescript"],
];

function sameFamily(a: string, b: string): boolean {
  return a === b || FAMILIES.some((f) => f.includes(a) && f.includes(b));
}

/**
 * Phase 3: detect a paste that looks like a different language than the file,
 * and offer to translate the whole block. Never replaces silently — translation
 * is too lossy for that.
 */
export class PasteTranslator implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly router: LlmRouter,
    private readonly statusBar: StatusBar,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e))
    );
  }

  private onChange(e: vscode.TextDocumentChangeEvent): void {
    const c = cfg();
    if (!c.enabled || !c.pasteEnabled) {
      return;
    }
    const target = PROFILES[e.document.languageId];
    if (!target || !c.languages.includes(e.document.languageId)) {
      return;
    }
    if (e.reason === vscode.TextDocumentChangeReason.Undo ||
        e.reason === vscode.TextDocumentChangeReason.Redo) {
      return;
    }
    // A paste arrives as a single large change; typing never does.
    if (e.contentChanges.length !== 1) {
      return;
    }
    const change = e.contentChanges[0];
    if (change.text.length < 40 || !change.text.includes("\n")) {
      return;
    }

    const detected = detectLanguage(change.text);
    if (!detected || sameFamily(detected.profile.id, target.id)) {
      return;
    }

    const range = insertedRange(change.range.start, change.text);
    void this.offer(e.document, range, change.text, detected.profile, target);
  }

  private async offer(
    doc: vscode.TextDocument,
    range: vscode.Range,
    pastedText: string,
    source: LanguageProfile,
    target: LanguageProfile
  ): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `Pasted code looks like ${source.name} — convert it to ${target.name}?`,
      `Convert to ${target.name}`,
      "Not now"
    );
    if (choice !== `Convert to ${target.name}`) {
      return;
    }
    // The user may have kept editing while the notification sat there.
    if (doc.isClosed || doc.getText(range) !== pastedText) {
      void vscode.window.showWarningMessage(
        "Autocorrect: the pasted text changed since the paste — not converting."
      );
      return;
    }
    await this.translate(doc, range, pastedText, source.name, target);
  }

  /** Manual fallback: "Autocorrect: Translate Selection to Current File's Language". */
  async translateSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showInformationMessage("Autocorrect: select the code to translate first.");
      return;
    }
    const target = PROFILES[editor.document.languageId];
    if (!target) {
      void vscode.window.showInformationMessage(
        `Autocorrect: unsupported language "${editor.document.languageId}".`
      );
      return;
    }
    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    const text = editor.document.getText(range);
    const detected = detectLanguage(text);
    await this.translate(
      editor.document, range, text, detected?.profile.name ?? "another language", target
    );
  }

  private async translate(
    doc: vscode.TextDocument,
    range: vscode.Range,
    sourceText: string,
    sourceName: string,
    target: LanguageProfile
  ): Promise<void> {
    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.router.complete({
          system:
            `You translate code between programming languages. ` +
            `Convert the given ${sourceName} code to idiomatic ${target.name}. ` +
            `Preserve behavior, names, and comments. ` +
            `Reply with ONLY the translated ${target.name} code — no code fences, no explanations.`,
          user: withUserContext(`Code to translate:\n${sourceText}`),
          maxTokens: 2048,
          signal: new AbortController().signal,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[paste] ${msg}`);
      void vscode.window.showErrorMessage(`Autocorrect: translation failed — ${msg}`);
      return;
    }

    const translated = stripFences(response);
    if (translated.trim().length === 0) {
      void vscode.window.showWarningMessage("Autocorrect: the model returned no code — not converting.");
      return;
    }
    // Final buffer check right before the edit.
    if (doc.isClosed || doc.getText(range) !== sourceText) {
      void vscode.window.showWarningMessage(
        "Autocorrect: the text changed while translating — not converting."
      );
      return;
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, range, translated);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      this.output.appendLine(
        `[paste] ${doc.fileName}: translated ${sourceText.split("\n").length} lines of ${sourceName} to ${target.name}`
      );
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

/** The range the inserted text occupies, given where it was inserted. */
export function insertedRange(start: vscode.Position, text: string): vscode.Range {
  const lines = text.split("\n");
  if (lines.length === 1) {
    return new vscode.Range(start, start.translate(0, text.length));
  }
  const lastLine = lines[lines.length - 1].replace(/\r$/, "");
  return new vscode.Range(
    start,
    new vscode.Position(start.line + lines.length - 1, lastLine.length)
  );
}
