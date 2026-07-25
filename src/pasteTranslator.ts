import * as vscode from "vscode";
import { cfg } from "./config";
import { globalPromptPrefix } from "./promptContext";
import { PROFILES, detectLanguage, LanguageProfile } from "./languages";
import { LlmRouter } from "./llmRouter";
import { stripFences } from "./llm";
import { looksLikeFaithfulTranslation } from "./pasteQuality";
import { GuardianRejectedError } from "./guardianJudge";
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
    // Allow short single-line foreign snippets (e.g. `int main(){ std::cout<<"hi"; }`).
    if (change.text.length < 20) {
      return;
    }
    if (!change.text.includes("\n") && change.text.length < 28) {
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
    const prefix = globalPromptPrefix();
    const user =
      (prefix ? `Project note (style only — do not invent code from it):\n${prefix}\n\n` : "") +
      `SOURCE language: ${sourceName}\n` +
      `TARGET language: ${target.name}\n\n` +
      `Translate ONLY the SOURCE snippet below into idiomatic ${target.name}.\n` +
      `Rules:\n` +
      `- Preserve behavior and string literals from the SOURCE.\n` +
      `- Do not invent new function/variable names that are not implied by the SOURCE.\n` +
      `- Do not include other file contents, comments about the file, or unrelated helpers.\n` +
      `- Reply with ONLY the translated ${target.name} code — no fences, no prose.\n\n` +
      `SOURCE:\n${sourceText}`;

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.router.complete({
          system:
            `You are a literal code translator from ${sourceName} to ${target.name}. ` +
            `You convert the given SOURCE snippet and nothing else. ` +
            `If SOURCE is a tiny main/print example, output a tiny ${target.name} equivalent. ` +
            `Never substitute a different program.`,
          user,
          maxTokens: 2048,
          signal: new AbortController().signal,
          kind: "paste",
          judgeOriginal: sourceText,
        })
      );
    } catch (err) {
      if (err instanceof GuardianRejectedError) {
        this.output.appendLine(`[paste] guardian rejected — logged candidate`);
        this.output.appendLine(`[paste] candidate:\n${err.candidate.slice(0, 1200)}`);
        const action = await vscode.window.showWarningMessage(
          "Autocorrect: Guardian rejected the translation — not applying.",
          "Show in Output",
          "Force apply"
        );
        if (action === "Show in Output") {
          this.output.show(true);
          return;
        }
        if (action === "Force apply") {
          response = err.candidate;
        } else {
          return;
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.output.appendLine(`[paste] ${msg}`);
        void vscode.window.showErrorMessage(`Autocorrect: translation failed — ${msg}`);
        return;
      }
    }

    const translated = stripFences(response).replace(/\r/g, "").replace(/\n$/, "");
    if (translated.trim().length === 0) {
      void vscode.window.showWarningMessage("Autocorrect: the model returned no code — not converting.");
      return;
    }

    if (!looksLikeFaithfulTranslation(sourceText, translated)) {
      this.output.appendLine(
        `[paste] rejected unfaithful translation\n` +
          `  source: ${JSON.stringify(sourceText.slice(0, 120))}\n` +
          `  model:  ${JSON.stringify(translated.slice(0, 200))}`
      );
      const action = await vscode.window.showWarningMessage(
        "Autocorrect: model reply does not look like a translation of the pasted code — not applying.",
        "Show in Output",
        "Force apply"
      );
      if (action === "Show in Output") {
        this.output.show(true);
        return;
      }
      if (action !== "Force apply") {
        return;
      }
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
