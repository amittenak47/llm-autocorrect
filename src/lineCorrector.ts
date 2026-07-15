import * as vscode from "vscode";
import { activeLlmProfile, cfg, isDeferQueueMode } from "./config";
import { ContextAssemblerService } from "./contextAssembler";
import { shouldFixLine } from "./diagnosticGate";
import { PROFILES, isCommentOrBlank, LanguageProfile } from "./languages";
import { FixQueue, QueuedFix } from "./fixQueue";
import { LlmRouter } from "./llmRouter";
import { lineFixUserMessage } from "./promptContext";
import { trimContextLines } from "./promptLimits";
import { fixForSingleLineTarget, isUnchanged, modelLines, normalizeModelText } from "./responseIngress";
import { StatusBar } from "./statusBar";

interface Pending {
  timer?: ReturnType<typeof setTimeout>;
  abort?: AbortController;
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
    private readonly router: LlmRouter,
    private readonly contextAsm: ContextAssemblerService,
    private readonly statusBar: StatusBar,
    private readonly queue: FixQueue,
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

  /** Menu C: correct cursor line, else previous non-blank line. */
  async correctLineNearCursor(queue = false): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
      return;
    }
    const profile = PROFILES[editor.document.languageId];
    if (!profile || !cfg().languages.includes(editor.document.languageId)) {
      vscode.window.setStatusBarMessage(
        `Autocorrect: unsupported language "${editor.document.languageId}"`,
        4000
      );
      return;
    }
    const doc = editor.document;
    let line = editor.selection.active.line;
    if (!editor.selection.isEmpty) {
      line = editor.selection.start.line;
      if (editor.selection.end.line !== line) {
        vscode.window.setStatusBarMessage("Autocorrect: select a single line for C", 3000);
        return;
      }
    } else if (doc.lineAt(line).text.trim().length === 0) {
      line--;
      while (line >= 0 && doc.lineAt(line).text.trim().length === 0) {
        line--;
      }
    }
    if (line < 0) {
      vscode.window.setStatusBarMessage("Autocorrect: no line to correct", 3000);
      return;
    }
    await this.check(doc.uri, line, profile, true, queue);
  }

  async executeQueuedLine(fix: QueuedFix): Promise<boolean> {
    const doc = this.docFor(vscode.Uri.parse(fix.uri));
    if (!doc || doc.isClosed || fix.line >= doc.lineCount) {
      return false;
    }
    if (doc.lineAt(fix.line).text !== fix.original) {
      return false;
    }
    const profile = PROFILES[doc.languageId];
    if (!profile) {
      return false;
    }
    await this.check(doc.uri, fix.line, profile, true, false, fix.profileId);
    return doc.lineAt(fix.line).text !== fix.original;
  }

  private docFor(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  }

  private async check(
    uri: vscode.Uri,
    line: number,
    profile: LanguageProfile,
    force: boolean,
    queue = false,
    profileIdOverride?: string
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
    // Diagnostics gate: local LSP only — never calls the LLM until passed.
    const manual = force;
    if (!(await shouldFixLine(doc.uri, line, manual, this.output))) {
      if (manual && cfg().fixRequireDiagnostic) {
        vscode.window.setStatusBarMessage(
          "Autocorrect: no LSP error on line — skipped (fix.requireDiagnostic)",
          4000
        );
      }
      return;
    }

    const wantsQueue = queue || (!force && cfg().queueEnabled);
    if (wantsQueue && isDeferQueueMode()) {
      const pid = profileIdOverride ?? activeLlmProfile().id;
      this.queue.addPendingLine(doc, line, original, pid);
      vscode.window.setStatusBarMessage("Autocorrect: task queued — Q to run", 4000);
      return;
    }

    const c = cfg();
    const contextStart = Math.max(0, line - c.contextLines);
    const contextLines: string[] = [];
    for (let i = contextStart; i < line; i++) {
      contextLines.push(doc.lineAt(i).text);
    }
    const context = trimContextLines(contextLines, c.contextLines, c.maxLineChars);

    const llmProfile = profileIdOverride
      ? (this.router.profileById(profileIdOverride) ?? activeLlmProfile())
      : activeLlmProfile();
    const tiers = force ? c.defaultTiers : { ...c.defaultTiers, recentEdits: false, openTabs: false, yank: false };
    const assembled = this.contextAsm.assembleLine(doc, line, profile, tiers, llmProfile);
    const finalUser = assembled.supplementary.trim()
      ? lineFixUserMessage(
          `${assembled.supplementary}\n\nContext (lines above the target):\n${context || "(start of file)"}`,
          original
        )
      : lineFixUserMessage(context, original);

    const key = this.key(doc.uri, line);
    const abort = new AbortController();
    this.pending.set(key, { abort });

    this.output.appendLine(`[line] calling LLM for ${doc.fileName}:${line + 1}`);

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.router.complete({
          system:
            `You are a strict single-line code autocorrector for ${profile.name}. ` +
            `The user shows you surrounding context and one TARGET line. ` +
            `If the TARGET line contains a typo or syntax error, reply with the corrected line(s), ` +
            `preserving leading indentation on the first line. ` +
            `You may add lines after the target when required to fix syntax (e.g. a missing closing bracket). ` +
            `If the line is already correct, reply with exactly: UNCHANGED\n` +
            `Never add explanations, quotes, or code fences. ` +
            `Never rewrite working code stylistically — fix mistakes only.`,
          user: finalUser,
          maxTokens: 300,
          signal: abort.signal,
          profileId: llmProfile.id,
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

    // Parse model output; accept multi-line fixes for a single-line target.
    const raw = normalizeModelText(response);
    if (isUnchanged(raw)) {
      this.log(`line ${line + 1}: model returned UNCHANGED`);
      return;
    }
    const corrected = fixForSingleLineTarget(modelLines(response));
    if (!corrected || corrected === original) {
      this.log(`line ${line + 1}: no meaningful change`);
      return;
    }
    // Whitespace-only diffs on the first line are more likely model noise than a fix.
    const firstLine = corrected.split("\n")[0];
    if (firstLine.trim() === original.trim() && !corrected.includes("\n")) {
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

    // Queued mode (reviewChanges): LLM now, review proposed edit on Q.
    if (wantsQueue) {
      this.queue.addLine(doc, line, original, corrected, llmProfile.id);
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(line, 0, line, original.length), corrected);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      const extra = corrected.split("\n").length - 1;
      this.output.appendLine(
        `[line] ${doc.fileName}:${line + 1}  "${original.trim()}" -> "${firstLine.trim()}"` +
          (extra > 0 ? ` (+${extra} line(s))` : "")
      );
      this.flash(doc, line, extra);
    }
  }

  /** Subtle 2-second highlight so the user notices the change happened. */
  private flash(doc: vscode.TextDocument, line: number, extraLines = 0): void {
    const editor = vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === doc.uri.toString()
    );
    if (!editor) {
      return;
    }
    const endLine = line + extraLines;
    editor.setDecorations(this.highlight, [
      new vscode.Range(line, 0, endLine, doc.lineAt(endLine).text.length),
    ]);
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
