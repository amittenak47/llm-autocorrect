import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { blockLineRange } from "./blockApply";
import { selectionLineSpan } from "./blockMath";
import { enclosingBlockSpan } from "./blockSpan";
import { activeLlmProfile, cfg } from "./config";
import { PROFILES } from "./languages";
import { LlmRouter } from "./llmRouter";
import { buildLogicPrompt, parseLogicIssues } from "./logicReview";
import { reportOutcome } from "./outcomes";
import { skipExcludedDocument, skipSecretTarget } from "./privacy";
import { applyLineChange } from "./regionLock";
import { StatusBar } from "./statusBar";

interface Suggestion {
  id: number;
  diagnostic: vscode.Diagnostic;
  original: string;
  replacement?: string;
}

export class LogicReviewer implements vscode.Disposable {
  private readonly diagnostics = vscode.languages.createDiagnosticCollection("autocorrect-logic");
  private readonly suggestions = new Map<string, Suggestion[]>();
  private readonly pending = new Map<string, AbortController>();
  private readonly subscriptions: vscode.Disposable[];
  private nextId = 0;

  constructor(
    private readonly router: LlmRouter,
    private readonly blockCapture: BlockCapture,
    private readonly statusBar: StatusBar,
    private readonly output: vscode.OutputChannel
  ) {
    this.subscriptions = [
      this.diagnostics,
      vscode.workspace.onDidChangeTextDocument((event) => this.onChange(event)),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        const key = doc.uri.toString();
        this.pending.get(key)?.abort();
        this.pending.delete(key);
        this.suggestions.delete(key);
        this.diagnostics.delete(doc.uri);
      }),
      vscode.languages.registerCodeActionsProvider(
        Object.keys(PROFILES).map((language) => ({ language })),
        { provideCodeActions: (doc, range, context) => this.codeActions(doc, range, context) },
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
      ),
      vscode.commands.registerCommand("autocorrect.applyLogicSuggestion", (uri: string, id: number) => this.apply(uri, id)),
      vscode.commands.registerCommand("autocorrect.dismissLogicSuggestion", (uri: string, id: number) => this.remove(uri, id)),
    ];
  }

  dispose(): void {
    this.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  clear(): void {
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    this.suggestions.clear();
    this.diagnostics.clear();
  }

  async run(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const noTarget = "Autocorrect: select code, stage a block, or put the cursor in a function";
    if (!editor) {
      vscode.window.setStatusBarMessage(noTarget, 4000);
      return;
    }
    const doc = editor.document;
    if (skipExcludedDocument(doc)) return;
    const language = PROFILES[doc.languageId];
    if (!language) {
      reportOutcome(`unsupported language "${doc.languageId}"`, { kind: "skip", output: this.output, statusBar: this.statusBar });
      return;
    }
    const selection = editor.selection;
    const staged = this.blockCapture.getStagedRange(editor);
    const span = staged ? { startLine: staged.start.line, endLine: staged.end.line } :
      !selection.isEmpty ? selectionLineSpan(selection.start.line, selection.end.line, selection.end.character) :
        enclosingBlockSpan(doc.getText().split(/\r?\n/), selection.active.line, doc.languageId);
    if (!span) {
      vscode.window.setStatusBarMessage(noTarget, 4000);
      return;
    }
    const range = blockLineRange(doc, span.startLine, span.endLine);
    const text = doc.getText(range).replace(/\r\n/g, "\n");
    const config = cfg();
    const profile = this.router.profileById(config.logicProfileId) ?? activeLlmProfile();
    if (skipSecretTarget(text, profile)) return;
    const maxIssues = Number.isFinite(config.logicMaxIssues) ? Math.max(0, Math.floor(config.logicMaxIssues)) : 5;
    const prompt = buildLogicPrompt(text, language.name, maxIssues);
    const version = doc.version;
    const key = doc.uri.toString();
    this.pending.get(key)?.abort();
    const controller = new AbortController();
    this.pending.set(key, controller);
    try {
      const response = await this.statusBar.withBusy(() => this.router.complete({
        ...prompt, maxTokens: 1024, signal: controller.signal, profileId: profile.id, kind: "raw",
      }));
      if (config.debug) this.output.appendLine(`[logic] raw reply:\n${response.slice(0, 1200)}`);
      if (controller.signal.aborted || this.pending.get(key) !== controller || doc.isClosed) return;
      if (doc.version !== version) {
        reportOutcome("buffer changed — skipped logic review", { kind: "skip", output: this.output, statusBar: this.statusBar });
        return;
      }
      const lines = text.split("\n");
      const issues = parseLogicIssues(response, lines.length, maxIssues);
      const kept = (this.suggestions.get(key) ?? []).filter((suggestion) =>
        suggestion.diagnostic.range.start.line < span.startLine || suggestion.diagnostic.range.start.line > span.endLine);
      for (const issue of issues) {
        const line = span.startLine + issue.line - 1;
        const original = lines[issue.line - 1];
        const replacement = issue.replacement === original ? undefined : issue.replacement;
        const message = issue.message + (replacement === undefined ? "" : ` — suggested: ${replacement.trim()}`);
        const diagnostic = new vscode.Diagnostic(doc.lineAt(line).range, message,
          issue.confidence === "high" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
        diagnostic.source = "autocorrect (logic)";
        kept.push({ id: this.nextId++, diagnostic, original, replacement });
      }
      this.publish(doc.uri, kept);
      reportOutcome(issues.length ? `${issues.length} possible logic issue(s) — see Problems` : "no logic issues found", {
        kind: "ok", output: this.output, statusBar: this.statusBar, logPrefix: "[logic]",
      });
    } catch (err) {
      if (!controller.signal.aborted) reportOutcome(`logic review failed — ${err instanceof Error ? err.message : String(err)}`, {
        kind: "error", output: this.output, statusBar: this.statusBar, logPrefix: "[logic]",
      });
    } finally {
      if (this.pending.get(key) === controller) this.pending.delete(key);
    }
  }

  private publish(uri: vscode.Uri, suggestions: Suggestion[]): void {
    if (suggestions.length) this.suggestions.set(uri.toString(), suggestions);
    else this.suggestions.delete(uri.toString());
    this.diagnostics.set(uri, suggestions.map((suggestion) => suggestion.diagnostic));
  }

  private onChange(event: vscode.TextDocumentChangeEvent): void {
    const doc = event.document;
    let suggestions = this.suggestions.get(doc.uri.toString());
    if (!suggestions) return;
    // Changes use pre-edit coordinates, so process from the bottom of the document upward.
    const changes = [...event.contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset);
    for (const change of changes) {
      suggestions = suggestions.filter((suggestion) => {
        const line = suggestion.diagnostic.range.start.line;
        const moved = applyLineChange({ startLine: line, endLine: line }, {
          startLine: change.range.start.line, endLine: change.range.end.line,
          addedLines: change.text.split(/\r?\n/).length - 1,
        });
        if (moved.touched) return false;
        suggestion.diagnostic.range = new vscode.Range(moved.region.startLine, 0, moved.region.endLine, suggestion.original.length);
        return true;
      });
    }
    this.publish(doc.uri, suggestions);
  }

  private codeActions(doc: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const key = doc.uri.toString();
    const actions: vscode.CodeAction[] = [];
    for (const suggestion of this.suggestions.get(key) ?? []) {
      const diagnostic = suggestion.diagnostic;
      if (!context.diagnostics.some((entry) => entry.source === diagnostic.source &&
        entry.message === diagnostic.message && entry.range.isEqual(diagnostic.range)) || diagnostic.range.start.line < range.start.line ||
        diagnostic.range.start.line > range.end.line) continue;
      if (suggestion.replacement !== undefined && doc.lineAt(diagnostic.range.start.line).text === suggestion.original) {
        const action = new vscode.CodeAction(`Apply suggestion: ${suggestion.replacement.trim().slice(0, 60)}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.command = { title: action.title, command: "autocorrect.applyLogicSuggestion", arguments: [key, suggestion.id] };
        actions.push(action);
      }
      const dismiss = new vscode.CodeAction("Dismiss logic suggestion", vscode.CodeActionKind.QuickFix);
      dismiss.diagnostics = [diagnostic];
      dismiss.command = { title: dismiss.title, command: "autocorrect.dismissLogicSuggestion", arguments: [key, suggestion.id] };
      actions.push(dismiss);
    }
    return actions;
  }

  private remove(key: string, id: number): void {
    this.publish(vscode.Uri.parse(key), (this.suggestions.get(key) ?? []).filter((suggestion) => suggestion.id !== id));
  }

  private async apply(key: string, id: number): Promise<void> {
    const suggestion = this.suggestions.get(key)?.find((entry) => entry.id === id);
    const doc = vscode.workspace.textDocuments.find((document) => document.uri.toString() === key);
    if (!suggestion || suggestion.replacement === undefined || !doc || doc.isClosed) return;
    const line = suggestion.diagnostic.range.start.line;
    if (doc.lineAt(line).text !== suggestion.original) return;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, doc.lineAt(line).range, suggestion.replacement);
    try {
      if (await vscode.workspace.applyEdit(edit)) this.remove(key, id);
      else reportOutcome("could not apply logic suggestion", { kind: "error", output: this.output, statusBar: this.statusBar });
    } catch (err) {
      reportOutcome(`could not apply logic suggestion — ${err instanceof Error ? err.message : String(err)}`, {
        kind: "error", output: this.output, statusBar: this.statusBar,
      });
    }
  }
}
