import * as vscode from "vscode";
import { cfg } from "./config";
import { PROFILES, isCommentOrBlank, LanguageProfile } from "./languages";
import { LlmClient, stripFences } from "./llm";
import { trimContextLines } from "./promptLimits";
import { StatusBar } from "./statusBar";

const CONTEXT_LINES = 10;

interface Pending {
  timer?: ReturnType<typeof setTimeout>;
  abort?: AbortController;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 2: when the user presses Enter, check the line they just left.
 * Pre-filters (blank/comment lines, diagnostics gate) keep LLM calls rare.
 */
export class LineCorrector implements vscode.Disposable {
  private readonly pending = new Map<string, Pending>();
  private readonly highlight: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly llm: LlmClient,
    private readonly statusBar: StatusBar,
    private readonly output: vscode.OutputChannel
  ) {
    this.highlight = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: new vscode.ThemeColor("diffEditor.insertedTextBackground"),
    });
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
      this.highlight
    );
  }

  private key(uri: vscode.Uri, line: number): string {
    return `${uri.toString()}:${line}`;
  }

  private log(message: string): void {
    if (cfg().debug) {
      this.output.appendLine(`[line] ${message}`);
    }
  }

  private describeDiagnostics(uri: vscode.Uri, line?: number): string[] {
    const diags = vscode.languages.getDiagnostics(uri);
    const filtered =
      line === undefined
        ? diags
        : diags.filter(
            (d) => d.range.start.line <= line && line <= d.range.end.line
          );
    return filtered.map((d) => {
      const sev = vscode.DiagnosticSeverity[d.severity] ?? String(d.severity);
      const msg = d.message.split("\n")[0].slice(0, 100);
      return `L${d.range.start.line + 1} [${sev}] ${msg}`;
    });
  }

  private logDiagnosticGate(
    uri: vscode.Uri, line: number, passed: boolean, waitedMs: number, forced: boolean
  ): void {
    if (forced) {
      this.output.appendLine("[line] diagnostic gate: bypassed (manual correct command)");
      return;
    }
    if (passed) {
      const found = this.describeDiagnostics(uri, line);
      this.output.appendLine(
        `[line] diagnostic gate: passed after ${waitedMs}ms — ${found.join(" | ")}`
      );
      return;
    }
    const onLine = this.describeDiagnostics(uri, line);
    const inFile = this.describeDiagnostics(uri);
    this.output.appendLine(
      `[line] skip line ${line + 1}: no LSP squiggle within ${waitedMs}ms (no API call made)`
    );
    this.output.appendLine(
      `[line]   squiggles on this line: ${onLine.length ? onLine.join(" | ") : "(none)"}`
    );
    if (inFile.length > 0) {
      this.output.appendLine(`[line]   squiggles in file: ${inFile.join(" | ")}`);
    } else {
      this.output.appendLine(
        "[line]   squiggles in file: (none) — install Anysphere Python, select an interpreter, reload window"
      );
    }
    this.output.appendLine(
      "[line]   tip: set autocorrect.line.requireDiagnostic to false to always call the LLM on Enter"
    );
  }

  /** Line the user just left when this change inserts a leading newline (Enter). */
  private enterLineFromChange(change: vscode.TextDocumentContentChangeEvent): number | undefined {
    if (!/\r?\n/.test(change.text)) {
      return undefined;
    }
    // Enter at EOL, split-line Enter, or Enter + auto-indent in one edit.
    if (/^\r?\n/.test(change.text)) {
      return change.range.start.line;
    }
    return undefined;
  }

  private isMultilinePaste(change: vscode.TextDocumentContentChangeEvent): boolean {
    const lineBreaks = change.text.split(/\r?\n/).length - 1;
    return lineBreaks > 1 || (!change.range.isEmpty && lineBreaks === 1 && !/^\r?\n/.test(change.text));
  }

  private linesAffectedBy(change: vscode.TextDocumentContentChangeEvent): number[] {
    const lines = new Set<number>();
    for (let i = change.range.start.line; i <= change.range.end.line; i++) {
      lines.add(i);
    }
    if (/\r?\n/.test(change.text)) {
      const addedLines = change.text.split(/\r?\n/).length - 1;
      for (let i = change.range.start.line; i <= change.range.start.line + addedLines; i++) {
        lines.add(i);
      }
    }
    return [...lines];
  }

  private isSourceDocument(doc: vscode.TextDocument): boolean {
    const scheme = doc.uri.scheme;
    return scheme === "file" || scheme === "untitled";
  }

  private onChange(e: vscode.TextDocumentChangeEvent): void {
    const c = cfg();
    if (!c.enabled || !c.lineEnabled) {
      return;
    }
    // Output panel, settings UI, etc. — not real source files.
    if (!this.isSourceDocument(e.document)) {
      return;
    }
    const profile = PROFILES[e.document.languageId];
    if (!profile || !c.languages.includes(e.document.languageId)) {
      return;
    }
    if (e.reason === vscode.TextDocumentChangeReason.Undo ||
        e.reason === vscode.TextDocumentChangeReason.Redo) {
      this.cancelAllFor(e.document.uri);
      return;
    }

    const enterLines = new Set<number>();
    for (const change of e.contentChanges) {
      const line = this.enterLineFromChange(change);
      if (line !== undefined) {
        enterLines.add(line);
      }
    }

    for (const line of enterLines) {
      this.log(`Enter on line ${line + 1}, scheduling check`);
      this.output.appendLine(`[line] Enter on ${e.document.fileName}:${line + 1}, scheduling check`);
      this.schedule(e.document.uri, line, profile, c.debounceMs);
    }

    for (const change of e.contentChanges) {
      if (this.enterLineFromChange(change) !== undefined) {
        continue;
      }
      if (this.isMultilinePaste(change)) {
        this.cancelAllFor(e.document.uri);
        continue;
      }
      for (const line of this.linesAffectedBy(change)) {
        if (!enterLines.has(line)) {
          this.cancel(this.key(e.document.uri, line));
        }
      }
    }
  }

  private schedule(
    uri: vscode.Uri, line: number, profile: LanguageProfile, debounceMs: number
  ): void {
    const key = this.key(uri, line);
    this.cancel(key);
    const entry: Pending = {};
    entry.timer = setTimeout(() => {
      this.pending.delete(key);
      void this.check(uri, line, profile, false);
    }, debounceMs);
    this.pending.set(key, entry);
  }

  private cancel(key: string): void {
    const entry = this.pending.get(key);
    if (entry) {
      if (entry.timer) {
        clearTimeout(entry.timer);
      }
      entry.abort?.abort();
      this.pending.delete(key);
    }
  }

  private cancelAllFor(uri: vscode.Uri): void {
    const prefix = uri.toString() + ":";
    for (const key of [...this.pending.keys()]) {
      if (key.startsWith(prefix)) {
        this.cancel(key);
      }
    }
  }

  private cursorOnLine(doc: vscode.TextDocument, line: number): boolean {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== doc.uri.toString()) {
      return false;
    }
    return editor.selections.some((s) => s.start.line <= line && line <= s.end.line);
  }

  /** Manual fallback: correct the selected line without waiting for Enter. */
  async correctSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      void vscode.window.showInformationMessage("Autocorrect: select the line to correct first.");
      return;
    }
    const profile = PROFILES[editor.document.languageId];
    if (!profile || !cfg().languages.includes(editor.document.languageId)) {
      void vscode.window.showInformationMessage(
        `Autocorrect: unsupported or disabled language "${editor.document.languageId}".`
      );
      return;
    }
    const line = editor.selection.start.line;
    if (editor.selection.end.line !== line) {
      void vscode.window.showInformationMessage("Autocorrect: select a single line to correct.");
      return;
    }
    await this.check(editor.document.uri, line, profile, true);
  }

  private docFor(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  }

  private async check(
    uri: vscode.Uri, line: number, profile: LanguageProfile, force: boolean
  ): Promise<void> {
    const doc = this.docFor(uri);
    if (!doc || doc.isClosed || line >= doc.lineCount) {
      this.log(`skip line ${line + 1}: document closed or line missing`);
      return;
    }
    const original = doc.lineAt(line).text;
    if (isCommentOrBlank(original, profile)) {
      this.log(`skip line ${line + 1}: blank or comment`);
      return;
    }
    // Never touch the line the cursor is on (unless the user explicitly asked).
    if (!force && this.cursorOnLine(doc, line)) {
      this.log(`skip line ${line + 1}: cursor still on line`);
      return;
    }
    // Diagnostics gate: local LSP check only — never calls the LLM API.
    if (!force && cfg().requireDiagnostic) {
      const waitMs = cfg().diagnosticWaitMs;
      this.output.appendLine(
        `[line] diagnostic gate: waiting up to ${waitMs}ms for a language-server squiggle on line ${line + 1} (local only, no API call)`
      );
      const { found, elapsed } = await this.waitForDiagnostic(doc.uri, line, waitMs);
      this.logDiagnosticGate(doc.uri, line, found, elapsed, false);
      if (!found) {
        return;
      }
    } else if (force) {
      this.logDiagnosticGate(doc.uri, line, true, 0, true);
    }

    const contextStart = Math.max(0, line - CONTEXT_LINES);
    const contextLines: string[] = [];
    for (let i = contextStart; i < line; i++) {
      contextLines.push(doc.lineAt(i).text);
    }
    const context = trimContextLines(contextLines, CONTEXT_LINES, 200);

    const key = this.key(doc.uri, line);
    const abort = new AbortController();
    this.pending.set(key, { abort });

    this.output.appendLine(`[line] calling LLM for ${doc.fileName}:${line + 1}`);

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.llm.complete({
          system:
            `You are a strict single-line code autocorrector for ${profile.name}. ` +
            `The user shows you surrounding context and one TARGET line. ` +
            `If the TARGET line contains a typo or syntax error, reply with ONLY the corrected line, ` +
            `preserving its original leading indentation. ` +
            `If the line is already correct, reply with exactly: UNCHANGED\n` +
            `Never reply with more than one line. Never add explanations, quotes, or code fences. ` +
            `Never rewrite working code stylistically — fix mistakes only.`,
          user:
            `Context (lines above the target):\n${context || "(start of file)"}\n\n` +
            `TARGET line:\n${original}`,
          maxTokens: 300,
          signal: abort.signal,
        })
      );
    } catch (err) {
      if (!abort.signal.aborted) {
        this.output.appendLine(`[line] ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    } finally {
      if (this.pending.get(key)?.abort === abort) {
        this.pending.delete(key);
      }
    }
    if (abort.signal.aborted) {
      return;
    }

    // Strict parse: single line, meaningfully different, or bail.
    let corrected = stripFences(response).replace(/\r?\n$/, "");
    if (corrected.trim() === "UNCHANGED" || corrected.includes("\n")) {
      this.log(`line ${line + 1}: model returned UNCHANGED or multi-line response`);
      return;
    }
    corrected = corrected.replace(/\r/g, "");
    if (corrected.trim().length === 0 || corrected === original) {
      this.log(`line ${line + 1}: no meaningful change`);
      return;
    }
    // Whitespace-only diffs are more likely model noise than a fix; skip them.
    if (corrected.trim() === original.trim()) {
      this.log(`line ${line + 1}: whitespace-only diff`);
      return;
    }

    // Re-validate the buffer: the line must be untouched and the cursor elsewhere.
    if (doc.isClosed || line >= doc.lineCount || doc.lineAt(line).text !== original) {
      return;
    }
    if (!force && this.cursorOnLine(doc, line)) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(line, 0, line, original.length), corrected);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      this.output.appendLine(`[line] ${doc.fileName}:${line + 1}  "${original.trim()}" -> "${corrected.trim()}"`);
      this.flash(doc, line);
    }
  }

  private hasDiagnostic(uri: vscode.Uri, line: number): boolean {
    return vscode.languages.getDiagnostics(uri).some(
      (d) =>
        d.severity <= vscode.DiagnosticSeverity.Warning &&
        d.range.start.line <= line &&
        line <= d.range.end.line
    );
  }

  private async waitForDiagnostic(
    uri: vscode.Uri, line: number, maxWaitMs: number
  ): Promise<{ found: boolean; elapsed: number }> {
    const start = Date.now();
    const deadline = start + maxWaitMs;
    while (Date.now() < deadline) {
      if (this.hasDiagnostic(uri, line)) {
        return { found: true, elapsed: Date.now() - start };
      }
      await sleep(200);
    }
    return { found: this.hasDiagnostic(uri, line), elapsed: Date.now() - start };
  }

  /** Subtle 2-second highlight so the user notices the change happened. */
  private flash(doc: vscode.TextDocument, line: number): void {
    const editor = vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === doc.uri.toString()
    );
    if (!editor) {
      return;
    }
    editor.setDecorations(this.highlight, [new vscode.Range(line, 0, line, 0)]);
    setTimeout(() => {
      if (!editor.document.isClosed) {
        editor.setDecorations(this.highlight, []);
      }
    }, 2000);
  }

  dispose(): void {
    for (const key of [...this.pending.keys()]) {
      this.cancel(key);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
