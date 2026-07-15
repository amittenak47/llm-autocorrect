import * as vscode from "vscode";
import { applyBlockText, blockLineRange } from "./blockApply";
import { blockMaxTokens } from "./blockMath";
import { activeLlmProfile, cfg } from "./config";
import {
  ContextAssemblerService,
  formatBlockWithContext,
} from "./contextAssembler";
import { shouldFixRange } from "./diagnosticGate";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { isCommentOrBlank, LanguageProfile, PROFILES } from "./languages";
import { LlmRouter } from "./llmRouter";
import { estimateTokens } from "./promptLimits";
import { blockFixUserMessage } from "./promptContext";
import { StagedAttributes, StagedOp } from "./stagedSession";
import { normalizeModelText, isUnchanged } from "./responseIngress";
import { StatusBar } from "./statusBar";

export interface ExecuteResult {
  ok: boolean;
  queued?: boolean;
}

export class StagedExecutor {
  constructor(
    private readonly router: LlmRouter,
    private readonly contextAsm: ContextAssemblerService,
    private readonly queue: FixQueue,
    private readonly statusBar: StatusBar,
    private readonly flash: Flash,
    private readonly output: vscode.OutputChannel
  ) {}

  async run(
    editor: vscode.TextEditor,
    range: vscode.Range,
    attrs: StagedAttributes,
    queue: boolean
  ): Promise<ExecuteResult> {
    const langProfile = PROFILES[editor.document.languageId];
    if (!langProfile || !cfg().languages.includes(editor.document.languageId)) {
      vscode.window.setStatusBarMessage(
        `Autocorrect: unsupported language "${editor.document.languageId}"`,
        4000
      );
      return { ok: false };
    }

    const doc = editor.document;
    const blockRange = blockLineRange(doc, range.start.line, range.end.line);
    const text = doc.getText(blockRange);
    if (text.trim().length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: staged block is empty", 3000);
      return { ok: false };
    }

    if (!shouldFixRange(doc.uri, blockRange.start.line, blockRange.end.line, this.output)) {
      vscode.window.setStatusBarMessage(
        "Autocorrect: no LSP error in block — skipped (fix.requireDiagnostic)",
        5000
      );
      return { ok: false };
    }

    const llmProfile =
      this.router.profileById(attrs.profileId) ?? this.router.activeProfile;
    const assembled = this.contextAsm.assembleBlock(editor, blockRange, attrs.tiers, llmProfile);
    const codePayload = formatBlockWithContext(text, assembled.supplementary);
    const userMsg = blockFixUserMessage(codePayload, attrs.contextNote);

    const lines = blockRange.end.line - blockRange.start.line + 1;
    const tierStr = attrs.tiers.nearby ? "" : " · minimal ctx";
    vscode.window.setStatusBarMessage(
      `Autocorrect: ${queue ? "queuing" : "sending"} ${lines}L [${llmProfile.label}]${tierStr} (~${assembled.estimatedTokens} tok)…`,
      6000
    );

    this.output.appendLine(
      `[staged] ${attrs.op} [${llmProfile.id}] ${doc.fileName}:${blockRange.start.line + 1}-${blockRange.end.line + 1}` +
        ` tiers=${assembled.includedTiers.join(",")}` +
        (attrs.contextNote ? ` ctx=${JSON.stringify(attrs.contextNote)}` : "")
    );

    let response: string;
    try {
      response = await this.statusBar.withBusy(() =>
        this.router.complete({
          system: this.systemPrompt(attrs.op, langProfile),
          user: userMsg,
          maxTokens: blockMaxTokens(text),
          signal: new AbortController().signal,
          profileId: llmProfile.id,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[staged] ${msg}`);
      vscode.window.setStatusBarMessage(`Autocorrect: failed — ${msg}`, 5000);
      return { ok: false };
    }

    let result = normalizeModelText(response);
    if (attrs.op === "fix" && isUnchanged(result)) {
      vscode.window.setStatusBarMessage("Autocorrect: already correct", 3000);
      return { ok: true };
    }
    if (result.trim().length === 0 || result === text) {
      vscode.window.setStatusBarMessage("Autocorrect: no changes from model", 3000);
      return { ok: false };
    }

    if (attrs.op === "caveman" && result.split("\n").length !== text.split("\n").length) {
      vscode.window.setStatusBarMessage("Autocorrect: caveman changed line count — skipped", 5000);
      return { ok: false };
    }
    if (attrs.op === "docs" && !this.docsPreserveCode(text, result, langProfile)) {
      this.output.appendLine("[staged] rejected docs output — code altered or class invented");
      vscode.window.setStatusBarMessage("Autocorrect: docs altered code — skipped", 5000);
      return { ok: false };
    }

    if (doc.isClosed || doc.getText(blockRange) !== text) {
      vscode.window.setStatusBarMessage("Autocorrect: buffer changed — skipped", 4000);
      return { ok: false };
    }

    const inLines = text.split("\n").length;
    const outLines = result.split("\n").length;
    if (outLines !== inLines) {
      this.output.appendLine(`[staged] line count ${inLines} → ${outLines} (block replace)`);
    }

    const queueLabel = `${attrs.op} ${blockRange.start.line + 1}-${blockRange.end.line + 1} · ${attrs.contextNote || "no ctx"}`;

    if (queue) {
      this.queue.addBlock(
        doc,
        blockRange.start.line,
        blockRange.end.line,
        text,
        result,
        queueLabel,
        attrs.op,
        attrs.contextNote,
        llmProfile.id
      );
      vscode.window.setStatusBarMessage(
        `Autocorrect: queued [${llmProfile.label}] — Q to review`,
        5000
      );
      return { ok: true, queued: true };
    }

    const edit = new vscode.WorkspaceEdit();
    applyBlockText(edit, doc.uri, doc, blockRange.start.line, blockRange.end.line, result);
    const applied = await vscode.workspace.applyEdit(edit);
    if (applied) {
      this.flash.show(
        editor,
        new vscode.Range(
          blockRange.start.line,
          0,
          blockRange.end.line + Math.max(0, outLines - inLines),
          0
        )
      );
      vscode.window.setStatusBarMessage(`Autocorrect: ${attrs.op} applied`, 3000);
      return { ok: true };
    }
    return { ok: false };
  }

  private systemPrompt(op: StagedOp, profile: LanguageProfile): string {
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
    return (
      `You are a strict code autocorrector for ${profile.name}. ` +
      `Fix typos and syntax errors only. Preserve style and comments where possible. ` +
      `You may add lines if required to fix syntax (e.g. missing closing bracket on its own line). ` +
      `If already correct, reply exactly: UNCHANGED\n` +
      `Reply with ONLY the code — no fences, no prose.`
    );
  }

  private docsPreserveCode(original: string, result: string, profile: LanguageProfile): boolean {
    const classRe = /\bclass\s+\w+/g;
    if ((result.match(classRe) ?? []).length > (original.match(classRe) ?? []).length) {
      return false;
    }
    for (const line of original.split("\n")) {
      if (isCommentOrBlank(line, profile)) {
        continue;
      }
      const t = line.trim();
      if (t.length > 0 && !result.includes(line) && !result.includes(t)) {
        return false;
      }
    }
    return true;
  }
}
