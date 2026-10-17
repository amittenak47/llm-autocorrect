import * as vscode from "vscode";
import { redactSecrets } from "./secretRedact";
import { skipExcludedDocument, skipSecretTarget } from "./privacy";
import { blockLineRange } from "./blockApply";
import { blockMaxTokens } from "./blockMath";
import { activeLlmProfile, cfg, isDeferQueueMode } from "./config";
import { effectiveMaxTokensBlock } from "./profiles";
import {
  ContextAssemblerService,
  formatBlockWithContext,
} from "./contextAssembler";
import { formatDiagnosticsForBlock } from "./diagPrompt";
import { builtinNames, definedNames } from "./fileNames";
import { checkFix } from "./fixChecks";
import { shouldFixRange } from "./diagnosticGate";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LanguageProfile, PROFILES } from "./languages";
import { LlmRouter } from "./llmRouter";
import { GuardianRejectedError } from "./guardianJudge";
import { offerRejectRecovery, reportOutcome } from "./outcomes";
import { blockFixUserMessage } from "./promptContext";
import {
  alignToLineCount,
  docsPreservesCode,
  isUnchanged,
  mergeCavemanComments,
  normalizeModelText,
  preserveLeadingIndent,
} from "./responseIngress";
import { StagedAttributes, StagedOp } from "./stagedSession";
import { StatusBar } from "./statusBar";
import { ApplyVerifier, snapshotDiagnostics, snapshotParserDiagnostics } from "./applyVerifier";
import { SyntaxChecker } from "./syntaxCheck";

export interface ExecuteResult {
  ok: boolean;
  queued?: boolean;
}

export class StagedExecutor {
  private readonly verifier: ApplyVerifier;

  constructor(
    private readonly router: LlmRouter,
    private readonly contextAsm: ContextAssemblerService,
    private readonly queue: FixQueue,
    private readonly statusBar: StatusBar,
    private readonly flash: Flash,
    private readonly output: vscode.OutputChannel,
    private readonly syntaxChecker: SyntaxChecker
  ) {
    this.verifier = new ApplyVerifier(queue, output, syntaxChecker);
  }

  async run(
    editor: vscode.TextEditor,
    range: vscode.Range,
    attrs: StagedAttributes,
    queue: boolean,
    fromQueue = false
  ): Promise<ExecuteResult> {
    if (!cfg().enabled) {
      vscode.window.setStatusBarMessage("Autocorrect is off — click the status bar item to turn it on", 4000);
      return { ok: false };
    }
    if (skipExcludedDocument(editor.document)) return { ok: false };
    const langProfile = PROFILES[editor.document.languageId];
    if (!langProfile || !cfg().languages.includes(editor.document.languageId)) {
      reportOutcome(`unsupported language "${editor.document.languageId}"`, {
        kind: "skip",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
      });
      return { ok: false };
    }

    const doc = editor.document;
    const blockRange = blockLineRange(doc, range.start.line, range.end.line);
    const text = doc.getText(blockRange);
    const textLf = text.replace(/\r\n/g, "\n");
    if (text.trim().length === 0) {
      reportOutcome("staged block is empty", {
        kind: "skip",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
      });
      return { ok: false };
    }

    const llmProfile =
      this.router.profileById(attrs.profileId) ?? this.router.activeProfile;
    if (skipSecretTarget(textLf, llmProfile)) return { ok: false };
    const queueLabel = `${attrs.op} ${blockRange.start.line + 1}-${blockRange.end.line + 1} · ${attrs.contextNote || "no ctx"}`;

    if (queue && isDeferQueueMode()) {
      const queued = await this.queue.addPendingBlock(
        doc,
        blockRange.start.line,
        blockRange.end.line,
        text,
        queueLabel,
        attrs.op,
        attrs.contextNote,
        llmProfile.id,
        attrs.tiers
      );
      if (!queued) {
        return { ok: false };
      }
      reportOutcome(`task queued [${llmProfile.label}] — Q to run`, {
        kind: "ok",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
        durationMs: 5000,
      });
      return { ok: true, queued: true };
    }

    const parserErrors = cfg().syntaxUseParser && this.syntaxChecker.supports(doc.languageId)
      ? await this.syntaxChecker.errors(doc.languageId, doc.getText()) : undefined;
    if (!cfg().enabled) {
      vscode.window.setStatusBarMessage("Autocorrect is off — click the status bar item to turn it on", 4000);
      return { ok: false };
    }
    if (!shouldFixRange(doc.uri, blockRange.start.line, blockRange.end.line, this.output,
      parserErrors?.map((error) => error.line))) {
      reportOutcome("no LSP error in block — skipped (fix.requireDiagnostic)", {
        kind: "skip",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
      });
      return { ok: false };
    }

    const assembled = this.contextAsm.assembleBlock(editor, blockRange, attrs.tiers, llmProfile);
    const codePayload = formatBlockWithContext(textLf, assembled.supplementary);
    const c = cfg();
    const plainFix = attrs.op === "fix" && !attrs.contextNote?.trim();
    const names = plainFix && (c.promptIncludeNames || c.fixLocalChecks)
      ? definedNames(doc.getText().split(/\r?\n/), doc.languageId, blockRange.start.line, Number.MAX_SAFE_INTEGER) : [];
    const lspDiags = snapshotDiagnostics(doc.uri);
    const parserDiags = (parserErrors ?? []).filter((error) => !lspDiags.some((d) => d.severity === 0 &&
      d.startLine <= error.line && error.line <= d.endLine)).map((error) => ({
      line: error.line, character: error.column, message: error.message, severity: 0,
    }));
    const diagnostics = c.promptIncludeDiagnostics ? formatDiagnosticsForBlock(
      blockRange.start.line, blockRange.end.line, [
        ...vscode.languages.getDiagnostics(doc.uri).map((d) => ({
          line: d.range.start.line, character: d.range.start.character, message: d.message, severity: d.severity,
        })),
        ...parserDiags,
      ].map((d) => ({ ...d, message: c.redactSecrets ? redactSecrets(d.message).text : d.message }))) : "";
    const userMsg = blockFixUserMessage(codePayload, attrs.contextNote, diagnostics,
      plainFix && c.promptIncludeNames ? names.slice(0, 60) : undefined);

    const lines = textLf.split("\n").length;
    const tierStr = attrs.tiers.nearby ? "" : " · minimal ctx";
    reportOutcome(
      `${queue ? "queuing" : "sending"} ${lines}L [${llmProfile.label}]${tierStr} (~${assembled.estimatedTokens} tok)…`,
      { kind: "info", durationMs: 6000 }
    );

    this.output.appendLine(
      `[staged] ${attrs.op} [${llmProfile.id}] ${doc.fileName}:${blockRange.start.line + 1}-${blockRange.end.line + 1}` +
        ` tiers=${assembled.includedTiers.join(",")}` +
        (attrs.contextNote ? ` ctx=${JSON.stringify(attrs.contextNote)}` : "")
    );

    let response: string;
    let soft = false;
    try {
      const hasInstruction = !!attrs.contextNote?.trim();
      const system = this.systemPrompt(attrs.op, langProfile, attrs.contextNote);
      if (c.debug) {
        this.output.appendLine(`[staged] prompt (system): ${system.slice(0, 3000)}`);
        this.output.appendLine(`[staged] prompt (user): ${userMsg.slice(0, 3000)}`);
      }
      response = await this.statusBar.withBusy(() =>
        this.router.complete({
          system,
          user: userMsg,
          maxTokens: effectiveMaxTokensBlock(llmProfile, blockMaxTokens(textLf)),
          signal: new AbortController().signal,
          profileId: llmProfile.id,
          // Instruction notes are deliberate edits (typing, renames, etc.) — not Guardian typo-judging.
          kind: attrs.op === "fix" && !hasInstruction ? "fix" : "raw",
          judgeOriginal: attrs.op === "fix" && !hasInstruction ? textLf : undefined,
        })
      );
    } catch (err) {
      if (err instanceof GuardianRejectedError) {
        this.output.appendLine(`[staged] guardian rejected — logged candidate`);
        reportOutcome("guardian rejected correction — see Output", {
          kind: "error",
          output: this.output,
          statusBar: this.statusBar,
          logPrefix: "[staged]",
          modelText: err.candidate,
        });
        if (cfg().onReject === "softApply") {
          response = err.candidate;
          soft = true;
        } else {
          return { ok: false };
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        reportOutcome(`failed — ${msg}`, {
          kind: "error",
          output: this.output,
          statusBar: this.statusBar,
          logPrefix: "[staged]",
        });
        return { ok: false };
      }
    }

    let result = normalizeModelText(response);
    if (attrs.op === "fix" || attrs.op === "docs") {
      result = preserveLeadingIndent(textLf, result);
    }
    if (attrs.op === "fix" && isUnchanged(result)) {
      if (attrs.contextNote?.trim()) {
        reportOutcome("model returned UNCHANGED despite context note", {
          kind: "skip",
          output: this.output,
          statusBar: this.statusBar,
          logPrefix: "[staged]",
          modelText: response,
        });
        return { ok: false };
      }
      reportOutcome("already correct", { kind: "ok", output: this.output, statusBar: this.statusBar, logPrefix: "[staged]" });
      return { ok: true };
    }
    if (result.trim().length === 0 || result === textLf) {
      reportOutcome("no changes from model", {
        kind: "skip",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
        modelText: response,
      });
      return { ok: false };
    }

    if (attrs.op === "caveman") {
      result = alignToLineCount(result, textLf.split("\n").length, true);
      const merged = mergeCavemanComments(textLf, result, langProfile);
      if (!merged) {
        const action = await offerRejectRecovery(
          "caveman rewrote code or line count — skipped",
          result,
          this.output
        );
        if (action !== "force") {
          return { ok: false };
        }
      } else {
        result = merged;
      }
    }

    if (attrs.op === "docs" && !docsPreservesCode(textLf, result, langProfile)) {
      const action = await offerRejectRecovery(
        "docs altered code — skipped",
        result,
        this.output
      );
      if (action !== "force") {
        return { ok: false };
      }
    }

    if (plainFix && c.fixLocalChecks) {
      const check = checkFix({ original: textLf, corrected: result, languageId: doc.languageId,
        fileNames: new Set(names), builtins: builtinNames(doc.languageId) });
      if (!check.ok) {
        this.output.appendLine(`[staged] local check rejected (${check.reason})\n${result.slice(0, 800)}`);
        vscode.window.setStatusBarMessage(`Autocorrect: skipped fix — ${check.reason}`, 4000);
        return { ok: false };
      }
    }

    if (doc.isClosed || doc.getText(blockRange) !== text) {
      reportOutcome("buffer changed — skipped", {
        kind: "skip",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
      });
      return { ok: false };
    }

    const inLines = textLf.split("\n").length;
    const outLines = result.split("\n").length;
    if (outLines !== inLines) {
      this.output.appendLine(`[staged] line count ${inLines} → ${outLines} (block replace)`);
    }

    // Local models sometimes paste the whole prompt context into the block.
    if (
      attrs.op === "fix" &&
      outLines > Math.max(inLines * 2, inLines + 4)
    ) {
      const choice = await vscode.window.showWarningMessage(
        `Model expanded the block from ${inLines} to ${outLines} lines. Apply this large replace?`,
        { modal: true },
        "Apply"
      );
      if (choice !== "Apply") {
        reportOutcome(`skipped large expansion (${inLines} → ${outLines} lines)`, {
          kind: "skip",
          output: this.output,
          statusBar: this.statusBar,
          logPrefix: "[staged]",
          modelText: result,
        });
        return { ok: false };
      }
    }

    if (queue) {
      const queued = await this.queue.addBlock(
        doc,
        blockRange.start.line,
        blockRange.end.line,
        text,
        result,
        soft ? `${queueLabel} (soft)` : queueLabel,
        attrs.op,
        attrs.contextNote,
        llmProfile.id,
        attrs.tiers
      );
      if (!queued) {
        return { ok: false };
      }
      reportOutcome(`queued [${llmProfile.label}] — Q to review changes`, {
        kind: "ok",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
        durationMs: 5000,
      });
      return { ok: true, queued: true };
    }

    const beforeParser = c.verifyAfterApply && attrs.op === "fix" && !fromQueue
      ? await snapshotParserDiagnostics(doc, this.syntaxChecker) : undefined;
    const beforeDiags = c.verifyAfterApply && attrs.op === "fix" && !fromQueue ? snapshotDiagnostics(doc.uri) : undefined;
    const applied = await this.queue.applyChange(
      doc,
      blockRange.start.line,
      blockRange.end.line,
      text,
      result,
      {
        profileId: llmProfile.id,
        op: attrs.op,
        label: soft ? `${queueLabel} (soft)` : queueLabel,
      }
    );
    if (applied) {
      if (beforeDiags) this.verifier.verify(doc, applied, beforeDiags, beforeParser);
      this.flash.show(
        editor,
        new vscode.Range(
          blockRange.start.line,
          0,
          blockRange.end.line + Math.max(0, outLines - inLines),
          0
        )
      );
      reportOutcome(soft ? "soft-applied rejected fix (revert at cursor)" : `${attrs.op} applied`, {
        kind: "ok",
        output: this.output,
        statusBar: this.statusBar,
        logPrefix: "[staged]",
      });
      return { ok: true };
    }
    reportOutcome("apply failed — see Output (baseline stale or editor rejected edit)", {
      kind: "error",
      output: this.output,
      statusBar: this.statusBar,
      logPrefix: "[staged]",
    });
    return { ok: false };
  }

  private systemPrompt(op: StagedOp, profile: LanguageProfile, contextNote?: string): string {
    if (op === "caveman") {
      return (
        `You add caveman-style comments to ${profile.name} code: ultra-short inline comments ` +
        `of 2-4 lowercase words. Append to lines that do real work; skip blanks and commented lines. ` +
        `Never change code, line order, or line count. ` +
        `Reply with ONLY the code — no fences, no prose.`
      );
    }
    if (op === "docs") {
      return (
        `You add documentation to ${profile.name} code ONLY. Insert docstrings or comment blocks. ` +
        `Never modify, add, or remove code lines. Do not invent classes, imports, or functions. ` +
        `The snippet may be incomplete — do not expand it. ` +
        `Reply with ONLY the code — no fences, no prose.`
      );
    }
    if (contextNote?.trim()) {
      return (
        `You edit the provided ${profile.name} CODE block to follow the user's instruction. ` +
        `Apply the requested change inside that block only (e.g. add type annotations, fix names). ` +
        `Do not paste surrounding file context or unrelated helpers. ` +
        `Do not reply UNCHANGED if the instruction asks for a change that is not already present. ` +
        `Reply with ONLY the updated CODE block — no fences, no prose.`
      );
    }
    return (
      `You are a strict code autocorrector for ${profile.name}. ` +
      `Fix typos and syntax errors in the provided CODE block only. ` +
      `If diagnostics are listed, they come from the language server and usually point at the real mistake; fix that mistake. ` +
      `Do not include surrounding context, other functions, or file headers in your reply. ` +
      `Keep roughly the same number of lines; only add lines when required for syntax ` +
      `(e.g. a missing closing bracket). ` +
      `If already correct, reply exactly: UNCHANGED\n` +
      `Reply with ONLY the corrected CODE block — no fences, no prose.`
    );
  }
}
