import * as vscode from "vscode";
import { redactSecrets } from "./secretRedact";
import { skipExcludedDocument, skipSecretTarget } from "./privacy";
import { activeLlmProfile, cfg, isDeferQueueMode } from "./config";
import { effectiveMaxTokensLine } from "./profiles";
import { ContextAssemblerService } from "./contextAssembler";
import { shouldFixLine, resolveLineFixTarget, previousNonBlankLine } from "./diagnosticGate";
import { PROFILES, isCommentOrBlank, LanguageProfile } from "./languages";
import { FixQueue, QueuedFix } from "./fixQueue";
import { LlmRouter } from "./llmRouter";
import { GuardianRejectedError } from "./guardianJudge";
import { lineFixUserMessage } from "./promptContext";
import {
  fixForSingleLineTarget,
  isUnchanged,
  modelLines,
  normalizeModelText,
  preserveLeadingIndent,
  stripReplyLabels,
} from "./responseIngress";
import { formatDiagnosticsForLine, lineFixExamples } from "./diagPrompt";
import { builtinNames, definedNames } from "./fileNames";
import { checkFix } from "./fixChecks";
import { statementSpan } from "./statementSpan";
import { ApplyVerifier, snapshotDiagnostics, snapshotParserDiagnostics } from "./applyVerifier";
import { postEditLine } from "./postEditLine";
import { StatusBar } from "./statusBar";
import { DiagLike, hasUpstreamEvidence } from "./upstreamTarget";
import { dropUnfinished, ParserError, SyntaxChecker } from "./syntaxCheck";

interface Pending {
  timer?: ReturnType<typeof setTimeout>;
  abort?: AbortController;
  text?: string;
}

/**
 * Phase 2: when the user presses Enter, check the line they just left.
 * Pre-filters (blank/comment lines, diagnostics gate) keep LLM calls rare.
 */
export class LineCorrector implements vscode.Disposable {
  private readonly pending = new Map<string, Pending>();
  private readonly noops = new Map<string, number>();
  private readonly verifier: ApplyVerifier;
  private readonly highlight: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly router: LlmRouter,
    private readonly contextAsm: ContextAssemblerService,
    private readonly statusBar: StatusBar,
    private readonly queue: FixQueue,
    private readonly output: vscode.OutputChannel,
    private readonly syntaxChecker: SyntaxChecker
  ) {
    this.verifier = new ApplyVerifier(queue, output, syntaxChecker);
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

    const changes = e.contentChanges.map((change) => ({
      startLine: change.range.start.line,
      startCharacter: change.range.start.character,
      endLine: change.range.end.line,
      endCharacter: change.range.end.character,
      addedLines: change.text.split(/\r?\n/).length - 1,
    }));
    const enterLines = new Set<number>();
    for (const [index, change] of e.contentChanges.entries()) {
      if (this.enterLineFromChange(change) !== undefined) {
        enterLines.add(postEditLine(changes, index));
      }
    }

    for (const line of enterLines) {
      this.log(`Enter on ${e.document.fileName}:${line + 1}, scheduling check`);
      this.schedule(e.document.uri, line, profile, c.debounceMs);
    }

    for (const [index, change] of e.contentChanges.entries()) {
      if (this.enterLineFromChange(change) !== undefined) {
        continue;
      }
      if (this.isMultilinePaste(change)) {
        this.cancelAllFor(e.document.uri);
        continue;
      }
      const delta = postEditLine(changes, index) - change.range.start.line;
      for (const oldLine of this.linesAffectedBy(change)) {
        const line = oldLine + delta;
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
    const pending = this.pending.get(key);
    const doc = this.docFor(uri);
    if (pending?.abort && doc && line < doc.lineCount && pending.text === doc.lineAt(line).text) {
      this.log(`skip line ${line + 1}: same text already in flight`);
      return;
    }
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
    if (!cfg().enabled) {
      vscode.window.setStatusBarMessage("Autocorrect is off — click the status bar item to turn it on", 4000);
      return;
    }
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
    if (!cfg().enabled) {
      vscode.window.setStatusBarMessage("Autocorrect is off — click the status bar item to turn it on", 4000);
      return false;
    }
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
    const result = await this.check(doc.uri, fix.line, profile, true, false, fix.profileId, { retried: false, noRedirect: false, fromQueue: true });
    return result === "applied" || result === "unchanged";
  }

  private docFor(uri: vscode.Uri): vscode.TextDocument | undefined {
    return vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  }

  /** Parser errors minus ones that only mean the user is still typing (open bracket, missing closer). */
  private async typingParserErrors(doc: vscode.TextDocument): Promise<ParserError[]> {
    const text = doc.getText();
    const errors = await this.syntaxChecker.errors(doc.languageId, text);
    const prefixes = PROFILES[doc.languageId]?.lineCommentPrefixes ?? ["#", "//"];
    return errors ? dropUnfinished(errors, text.split(/\r?\n/), prefixes) : [];
  }

  private async parserDiagnostics(doc: vscode.TextDocument): Promise<(DiagLike & { character: number })[]> {
    if (!cfg().syntaxUseParser || !this.syntaxChecker.supports(doc.languageId)) return [];
    const errors = await this.typingParserErrors(doc);
    const diags = snapshotDiagnostics(doc.uri);
    return errors.filter((error) => !diags.some((d) => d.severity === 0 &&
      d.startLine <= error.line && error.line <= d.endLine)).map((error) => ({
      startLine: error.line, endLine: error.endLine, character: error.column, message: error.message, severity: 0,
    }));
  }

  private async check(
    uri: vscode.Uri,
    line: number,
    profile: LanguageProfile,
    force: boolean,
    queue = false,
    profileIdOverride?: string,
    options = { retried: false, noRedirect: false, fromQueue: false }
  ): Promise<"applied" | "unchanged" | "skipped"> {
    const doc = this.docFor(uri);
    if (!doc || doc.isClosed || line >= doc.lineCount) {
      this.log(`skip line ${line + 1}: document closed or line missing`);
      return "skipped";
    }
    if (skipExcludedDocument(doc)) return "skipped";
    const startingLine = line;
    let original = doc.lineAt(line).text;
    if (isCommentOrBlank(original, profile)) {
      this.log(`skip line ${line + 1}: blank or comment`);
      return "skipped";
    }
    const canRun = (): boolean => {
      const c = cfg();
      if (!c.enabled) return false;
      if (force) {
        return true;
      }
      return c.enabled && c.lineEnabled && c.languages.includes(doc.languageId);
    };
    if (!canRun()) {
      return "skipped";
    }
    let key = this.key(doc.uri, line);
    const pending = this.pending.get(key);
    if (pending?.abort && pending.text === original) {
      this.log(`skip line ${line + 1}: same text already in flight`);
      return "skipped";
    }
    if (pending) {
      this.cancel(key);
    }
    const abort = new AbortController();
    this.pending.set(key, { abort, text: original });
    try {
      // Diagnostics gate: local parser/LSP only — never calls the LLM until passed.
      const manual = force;
      const parserHasError = cfg().syntaxUseParser && this.syntaxChecker.supports(doc.languageId)
        ? async (): Promise<boolean> => (await this.typingParserErrors(doc))
          .some((error) => error.line <= line && line <= error.endLine)
        : undefined;
      const passedGate = await shouldFixLine(doc.uri, line, manual, this.output, abort.signal, parserHasError);
      if (abort.signal.aborted) {
        return "skipped";
      }
      if (!passedGate) {
        if (manual && cfg().fixRequireDiagnostic) {
          vscode.window.setStatusBarMessage(
            "Autocorrect: no LSP error on line — skipped (fix.requireDiagnostic)",
            4000
          );
        } else if (!manual && cfg().requireDiagnostic) {
          vscode.window.setStatusBarMessage(
            "Autocorrect: no LSP error — skipped. On Cursor set line.requireDiagnostic false",
            6000
          );
        }
        return "skipped";
      }

      const parserDiags = await this.parserDiagnostics(doc);
      if (abort.signal.aborted || doc.isClosed || line >= doc.lineCount) {
        return "skipped";
      }
      const fixLine = options.noRedirect ? line : resolveLineFixTarget(doc.uri, doc, line, parserDiags);
      if (fixLine !== line) {
        this.output.appendLine(
          `[line] redirecting fix from line ${line + 1} to line ${fixLine + 1} (upstream syntax error)`
        );
        const nextKey = this.key(doc.uri, fixLine);
        const targetText = doc.lineAt(fixLine).text;
        const pending = this.pending.get(nextKey);
        if (pending?.abort && pending.text === targetText) {
          this.log(`skip line ${fixLine + 1}: same text already in flight`);
          return "skipped";
        }
        if (pending) {
          this.cancel(nextKey);
        }
        if (this.pending.get(key)?.abort === abort) {
          this.pending.delete(key);
        }
        key = nextKey;
        line = fixLine;
        this.pending.set(key, { abort, text: targetText });
      }
      original = doc.lineAt(line).text;
      if (isCommentOrBlank(original, profile)) {
        this.log(`skip line ${line + 1}: blank or comment`);
        return "skipped";
      }
      // Never touch the line the cursor is on (unless the user explicitly asked).
      if (!force && this.cursorOnLine(doc, line)) {
        this.log(`skip line ${line + 1}: cursor still on line`);
        return "skipped";
      }

      const c = cfg();
      const fileLines = doc.getText().split(/\r?\n/);
      const span = c.lineWholeStatement && line === startingLine
        ? statementSpan(fileLines, line, 10, profile.lineCommentPrefixes, doc.languageId === "python")
        : { startLine: line, endLine: line };
      const multiline = span.startLine !== span.endLine;
      original = fileLines.slice(span.startLine, span.endLine + 1).join("\n");
      // Queue/apply baselines retain the document's EOLs; model text uses LF.
      const baseline = doc.getText(new vscode.Range(span.startLine, 0, span.endLine, doc.lineAt(span.endLine).text.length));
      const cursorOnSpan = (): boolean => {
        for (let row = span.startLine; row <= span.endLine; row++) {
          if (this.cursorOnLine(doc, row)) return true;
        }
        return false;
      };
      if (!force && multiline && cursorOnSpan()) {
        this.log(`skip lines ${span.startLine + 1}-${span.endLine + 1}: cursor still in target`);
        return "skipped";
      }
      const bufferMatches = (): boolean => !doc.isClosed && span.endLine < doc.lineCount &&
        doc.getText(new vscode.Range(span.startLine, 0, span.endLine, doc.lineAt(span.endLine).text.length)) === baseline;
      const names = c.promptIncludeNames || c.fixLocalChecks ? definedNames(fileLines, doc.languageId, line, Number.MAX_SAFE_INTEGER) : [];
      const localCheck = (corrected: string): boolean => {
        if (!c.fixLocalChecks) return true;
        const result = checkFix({ original, corrected, languageId: doc.languageId,
          fileNames: new Set(names), builtins: builtinNames(doc.languageId) });
        if (result.ok) return true;
        this.output.appendLine(`[line] local check rejected (${result.reason}):\n${corrected.slice(0, 800)}`);
        vscode.window.setStatusBarMessage(`Autocorrect: skipped fix — ${result.reason}`, 4000);
        return false;
      };
      const llmProfile = profileIdOverride
        ? (this.router.profileById(profileIdOverride) ?? activeLlmProfile())
        : activeLlmProfile();
      if (skipExcludedDocument(doc) || skipSecretTarget(original, llmProfile)) return "skipped";
      const wantsQueue = queue || (!force && c.queueEnabled);
      if (abort.signal.aborted || !canRun()) {
        return "skipped";
      }
      if (wantsQueue && isDeferQueueMode()) {
        const pid = profileIdOverride ?? activeLlmProfile().id;
        const queued = multiline
          ? await this.queue.addPendingBlock(doc, span.startLine, span.endLine, baseline,
            `lines ${span.startLine + 1}-${span.endLine + 1}`, "fix", "", pid, c.defaultTiers)
          : await this.queue.addPendingLine(doc, line, original, pid);
        if (queued) {
          vscode.window.setStatusBarMessage("Autocorrect: task queued — Q to run", 4000);
        }
        return queued ? "applied" : "skipped";
      }

      // Same text with the same diagnostics → same answer; a new squiggle invalidates the cached no-op.
      const lineDiags = vscode.languages
        .getDiagnostics(uri)
        .filter((d) => d.range.start.line <= line && line <= d.range.end.line)
        .map((d) => d.message)
        .sort()
        .join("\u0001");
      const noopKey = `${uri.toString()}\u0000${original}\u0000${lineDiags}`;
      const lastNoop = this.noops.get(noopKey);
      if (!force && lastNoop !== undefined && Date.now() - lastNoop < 10 * 60_000) {
        this.log(`line ${line + 1}: cached no-op`);
        return "unchanged";
      }
      const noOp = async (): Promise<"applied" | "unchanged"> => {
        this.noops.delete(noopKey);
        this.noops.set(noopKey, Date.now());
        if (this.noops.size > 500) {
          this.noops.delete(this.noops.keys().next().value!);
        }
        const result = await this.maybeRetryUpstream(uri, line, startingLine, profile, force, queue, profileIdOverride, options);
        return result === "applied" ? "applied" : "unchanged";
      };

      const tiers = force ? c.defaultTiers : { ...c.defaultTiers, recentEdits: false, openTabs: false, yank: false };
      const assembled = this.contextAsm.assembleLine(doc, line, profile, tiers, llmProfile, span.startLine);
      const diagnostics = c.promptIncludeDiagnostics ? formatDiagnosticsForLine(line, [
        ...vscode.languages.getDiagnostics(uri).map((d) => ({
          line: d.range.start.line, character: d.range.start.character, message: d.message, severity: d.severity,
        })),
        ...parserDiags.map((d) => ({ line: d.startLine, character: d.character, message: d.message, severity: d.severity })),
      ].map((d) => ({ ...d, message: c.redactSecrets ? redactSecrets(d.message).text : d.message }))) : "";
      const finalUser = lineFixUserMessage(
        assembled.supplementary.trim() || "(start of file)",
        original, diagnostics, c.promptIncludeNames ? names.slice(0, 60) : undefined, multiline
      );

      if (abort.signal.aborted) {
        return "skipped";
      }
      this.output.appendLine(`[line] calling LLM for ${doc.fileName}:${line + 1}`);

      const system =
        `You are a strict ${multiline ? "code" : "single-line code"} autocorrector for ${profile.name}. ` +
        `The user shows you surrounding context and ${multiline ? "TARGET lines" : "one TARGET line"}. ` +
        `If the TARGET ${multiline ? "lines contain" : "line contains"} a typo or syntax error, reply with the corrected line(s), ` +
        `preserving leading indentation on the first line. ` +
        `You may add lines after the target when required to fix syntax (e.g. a missing closing bracket). ` +
        `If the line is already correct, reply with exactly: UNCHANGED\n` +
        `Never add explanations, quotes, code fences, or labels such as "REPLY:" or "Correction:" — reply with the code only. ` +
        `Never rewrite working code stylistically — fix mistakes only. ` +
        `If diagnostics are listed, they come from the language server and usually point at the real mistake; fix that mistake. ` +
        `Fix only the TARGET ${multiline ? "lines" : "line"} — diagnostics on other lines are context, never a reason to rewrite another line.` +
        (c.promptExamples
          ? `\n\nExamples (broken line -> your entire reply):\n${lineFixExamples(doc.languageId)}`
          : "");

      let response: string;
      try {
        this.log(`prompt (system): ${system.slice(0, 3000)}`);
        this.log(`prompt (user): ${finalUser.slice(0, 3000)}`);
        response = await this.statusBar.withBusy(() =>
          this.router.complete({
            system,
            user: finalUser,
            maxTokens: effectiveMaxTokensLine(llmProfile),
            signal: abort.signal,
            profileId: llmProfile.id,
            kind: "fix",
            judgeOriginal: original,
          })
        );
      } catch (err) {
        if (!abort.signal.aborted) {
          if (err instanceof GuardianRejectedError) {
            this.output.appendLine(`[line] guardian rejected — logged candidate`);
            this.output.appendLine(`[line] candidate:\n${err.candidate.slice(0, 1200)}`);
            if (cfg().onReject === "softApply") {
              if (isUnchanged(stripReplyLabels(normalizeModelText(err.candidate)))) {
                return noOp();
              }
              const corrected = preserveLeadingIndent(
                original,
                fixForSingleLineTarget(modelLines(err.candidate)) ?? ""
              );
              if (!corrected.trim() || corrected === original) {
                return noOp();
              }
              if (!localCheck(corrected)) return "skipped";
              if (!bufferMatches()) {
                this.log(`skip line ${line + 1}: buffer changed while waiting`);
                return "skipped";
              }
              if (abort.signal.aborted || !canRun()) {
                return "skipped";
              }
              const beforeParser = c.verifyAfterApply && !options.fromQueue
                ? await snapshotParserDiagnostics(doc, this.syntaxChecker) : undefined;
              const beforeDiags = c.verifyAfterApply && !options.fromQueue ? snapshotDiagnostics(doc.uri) : undefined;
              const applied = await this.queue.applyChange(doc, span.startLine, span.endLine, baseline, corrected, {
                profileId: llmProfile.id,
                op: "fix",
                label: multiline ? `lines ${span.startLine + 1}-${span.endLine + 1} (soft)` : `line ${line + 1} (soft)`,
              });
              if (applied) {
                if (beforeDiags) this.verifier.verify(doc, applied, beforeDiags, beforeParser);
                this.output.appendLine(
                  `[line] soft-applied guardian-rejected fix (revert via Remove or Revert at Cursor)`
                );
              }
              return applied ? "applied" : "skipped";
            }
            return "skipped";
          }
          this.output.appendLine(`[line] ${err instanceof Error ? err.message : String(err)}`);
        }
        return "skipped";
      } finally {
        if (this.pending.get(key)?.abort === abort) {
          this.pending.delete(key);
        }
      }
      if (abort.signal.aborted) {
        return "skipped";
      }

      // Parse model output; accept multi-line fixes for a single-line target.
      // "REPLY: UNCHANGED" counts as UNCHANGED; labels never reach the buffer.
      const raw = stripReplyLabels(normalizeModelText(response));
      if (isUnchanged(raw)) {
        this.log(`line ${line + 1}: model returned UNCHANGED`);
        return noOp();
      }
      const parsed = fixForSingleLineTarget(modelLines(response));
      if (!parsed) {
        this.log(`line ${line + 1}: no meaningful change`);
        return noOp();
      }
      // Keep the buffer's Enter auto-indent; models often strip leading whitespace.
      const corrected = preserveLeadingIndent(original, parsed);
      if (corrected === original) {
        this.log(`line ${line + 1}: no meaningful change (indent preserved)`);
        return noOp();
      }

      if (!localCheck(corrected)) return "skipped";

      // Re-validate the entire target span before queueing or applying.
      if (!bufferMatches()) {
        this.log(`skip line ${line + 1}: buffer changed while waiting`);
        return "skipped";
      }

      if (!canRun()) {
        return "skipped";
      }

      // Queued mode (reviewChanges): LLM now, review proposed edit on Q.
      if (wantsQueue) {
        const queued = multiline
          ? await this.queue.addBlock(doc, span.startLine, span.endLine, baseline, corrected,
            `lines ${span.startLine + 1}-${span.endLine + 1}`, "fix", "", llmProfile.id, tiers)
          : await this.queue.addLine(doc, line, original, corrected, llmProfile.id);
        return queued ? "applied" : "skipped";
      }

      // If the cursor returned to this line while the LLM ran, still apply as soft
      // so clicking around does not silently drop a finished correction.
      const softBecauseCursor = !force && cursorOnSpan();
      const targetLabel = multiline ? `lines ${span.startLine + 1}-${span.endLine + 1}` : `line ${line + 1}`;
      const label = softBecauseCursor ? `${targetLabel} (soft)` : targetLabel;
      const beforeParser = c.verifyAfterApply && !options.fromQueue
        ? await snapshotParserDiagnostics(doc, this.syntaxChecker) : undefined;
      const beforeDiags = c.verifyAfterApply && !options.fromQueue ? snapshotDiagnostics(doc.uri) : undefined;
      const applied = await this.queue.applyChange(doc, span.startLine, span.endLine, baseline, corrected, {
        profileId: llmProfile.id,
        op: "fix",
        label,
      });
      if (applied) {
        if (beforeDiags) this.verifier.verify(doc, applied, beforeDiags, beforeParser);
        const extra = corrected.split("\n").length - 1;
        const firstLine = corrected.split("\n")[0];
        this.output.appendLine(
          `[line] ${doc.fileName}:${line + 1}  "${original.trim()}" -> "${firstLine.trim()}"` +
            (extra > 0 ? ` (+${extra} line(s))` : "") +
            (softBecauseCursor ? " (soft — cursor was on line)" : "")
        );
        this.flash(doc, span.startLine, extra);
      }
      return applied ? "applied" : "skipped";
    } finally {
      if (this.pending.get(key)?.abort === abort) {
        this.pending.delete(key);
      }
    }
  }

  /** After a no-op, try the original target or an evidenced upstream line once. */
  private async maybeRetryUpstream(
    uri: vscode.Uri,
    line: number,
    startingLine: number,
    profile: LanguageProfile,
    force: boolean,
    queue: boolean,
    profileIdOverride: string | undefined,
    options: { retried: boolean; noRedirect: boolean; fromQueue: boolean }
  ): Promise<"applied" | "unchanged" | "skipped"> {
    if (options.retried) {
      return "unchanged";
    }
    const doc = this.docFor(uri);
    if (!doc || doc.isClosed) {
      return "unchanged";
    }
    if (line !== startingLine) {
      this.output.appendLine(`[line] retrying original line ${startingLine + 1} after no-op on line ${line + 1}`);
      return this.check(uri, startingLine, profile, force, queue, profileIdOverride, { ...options, retried: true, noRedirect: true });
    }
    const parserDiags = await this.parserDiagnostics(doc);
    let upstream = resolveLineFixTarget(doc.uri, doc, line, parserDiags);
    if (upstream === line) {
      const prev = previousNonBlankLine(doc, line);
      if (prev !== undefined && prev !== line) {
        upstream = prev;
      }
    }
    const diags = [...vscode.languages.getDiagnostics(uri).map((d) => ({
      startLine: d.range.start.line,
      endLine: d.range.end.line,
      message: d.message,
      severity: d.severity,
    })), ...parserDiags];
    if (upstream === line || !hasUpstreamEvidence(upstream, diags)) {
      return "unchanged";
    }
    this.output.appendLine(
      `[line] retrying upstream line ${upstream + 1} after no-op on line ${line + 1}`
    );
    return this.check(uri, upstream, profile, force, queue, profileIdOverride, { ...options, retried: true, noRedirect: false });
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
