import * as vscode from "vscode";
import { cfg } from "./config";
import {
  assembleWithinBudget,
  collapseImports,
  ContextChunk,
  dedupeChunks,
  stripBlankLines,
  truncateLines,
} from "./contextCompress";
import { EditRing } from "./editRing";
import { LanguageProfile, PROFILES } from "./languages";
import { isExcludedDocument } from "./privacy";
import { redactSecrets } from "./secretRedact";
import { ContextTiers, LlmProfileConfig, tokenBudgetForPolicy } from "./profiles";
import {
  collectNearbyLines,
  enclosingSignatureText,
  orderContextChunks,
} from "./contextScope";

export interface AssembledContext {
  supplementary: string;
  estimatedTokens: number;
  includedTiers: string[];
}

export class ContextAssemblerService implements vscode.Disposable {
  private readonly editRing = new EditRing();
  private lastYank = "";
  private lastYankDocument?: vscode.TextDocument;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output?: vscode.OutputChannel) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        const sel = e.textEditor.selection;
        if (!sel.isEmpty && !isExcludedDocument(e.textEditor.document)) {
          const t = e.textEditor.document.getText(sel);
          if (t.length > 20 && t.length < 4000) {
            this.lastYank = t;
            this.lastYankDocument = e.textEditor.document;
          }
        }
      })
    );
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    const uri = e.document.uri.toString();
    if (isExcludedDocument(e.document)) {
      this.editRing.clear(uri);
      return;
    }
    for (const change of e.contentChanges) {
      if (change.text.length < 2) {
        continue;
      }
      const start = change.range.start.line;
      const added = change.text.split(/\r?\n/).length - 1;
      const end = change.range.end.line + added;
      const lines: string[] = [];
      for (let i = start; i <= Math.min(end, e.document.lineCount - 1); i++) {
        lines.push(e.document.lineAt(i).text);
      }
      this.editRing.record(uri, start, end, lines);
    }
  }

  estimateForBlock(
    editor: vscode.TextEditor,
    range: vscode.Range,
    tiers: ContextTiers,
    llmProfile: LlmProfileConfig
  ): number {
    return this.assembleBlock(editor, range, tiers, llmProfile, true).estimatedTokens;
  }

  assembleBlock(
    editor: vscode.TextEditor,
    range: vscode.Range,
    tiers: ContextTiers,
    llmProfile: LlmProfileConfig,
    estimateOnly = false
  ): AssembledContext {
    const doc = editor.document;
    const target = doc.getText(range);
    const budget = this.resolveBudget(llmProfile);
    const chunks = this.buildChunks(
      doc,
      range.start.line,
      range.end.line,
      target,
      tiers,
      editor,
      true,
      PROFILES[doc.languageId]
    );
    const result = assembleWithinBudget(chunks, budget);
    const suppChunks = chunks.filter((c) => c.tier !== "target" && result.includedTiers.includes(c.tier));
    const supplementary = suppChunks
      .map((c) => `--- ${c.label} ---\n${c.text}`)
      .join("\n\n");
    if (estimateOnly) {
      return { supplementary: "", estimatedTokens: result.estimatedTokens, includedTiers: result.includedTiers };
    }
    return { supplementary, estimatedTokens: result.estimatedTokens, includedTiers: result.includedTiers };
  }

  assembleLine(
    doc: vscode.TextDocument,
    line: number,
    profile: LanguageProfile,
    tiers: ContextTiers,
    llmProfile: LlmProfileConfig,
    startLine = line
  ): AssembledContext {
    const target = doc.getText(new vscode.Range(startLine, 0, line, doc.lineAt(line).text.length)).replace(/\r\n/g, "\n");
    const budget = this.resolveBudget(llmProfile);
    const chunks = this.buildChunks(doc, startLine, line, target, tiers, undefined, false, profile);
    const result = assembleWithinBudget(chunks, budget);
    const suppChunks = chunks.filter((c) => c.tier !== "target" && result.includedTiers.includes(c.tier));
    const supplementary = suppChunks
      .map((c) => `--- ${c.label} ---\n${c.text}`)
      .join("\n\n");
    return { supplementary: supplementary.trim(), estimatedTokens: result.estimatedTokens, includedTiers: result.includedTiers };
  }

  private resolveBudget(llmProfile: LlmProfileConfig): number {
    const global = cfg().tokenBudget;
    if (global > 0) {
      return global;
    }
    return tokenBudgetForPolicy(llmProfile.contextPolicy ?? "minimal");
  }

  private buildChunks(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    target: string,
    tiers: ContextTiers,
    _editor: vscode.TextEditor | undefined,
    _isBlock: boolean,
    langProfile?: LanguageProfile
  ): ContextChunk[] {
    const c = cfg();
    const chunks: ContextChunk[] = [{ tier: "target", label: "target", text: target }];
    if (isExcludedDocument(doc)) return chunks;
    const allLines: string[] = [];
    for (let i = 0; i < doc.lineCount; i++) {
      allLines.push(doc.lineAt(i).text);
    }

    if (tiers.signature) {
      const sig = enclosingSignatureText(allLines, startLine, c.signatureDepth);
      if (sig) {
        chunks.push({
          tier: "signature",
          label: c.signatureDepth === "chain" ? "enclosing signature chain" : "enclosing signature",
          text: sig,
        });
      }
    }

    if (tiers.nearby) {
      const nearby = collectNearbyLines(
        allLines,
        startLine,
        endLine,
        c.contextLines,
        c.contextLinesBelow,
        c.nearbyMode,
        _isBlock ? ">>> CODE BLOCK <<<" : ">>> TARGET LINE <<<"
      );
      if (nearby.trim()) {
        chunks.push({
          tier: "nearby",
          label: c.nearbyMode === "indentScope" ? "nearby (indent scope)" : "nearby lines",
          text: nearby,
        });
      }
    }

    if (c.ringEnabled && tiers.recentEdits) {
      const hunks = this.editRing.get(doc.uri.toString(), startLine);
      if (hunks.length > 0) {
        chunks.push({
          tier: "recentEdits",
          label: "recent edits",
          text: dedupeChunks(hunks.map((h) => h.snippet)).join("\n---\n"),
        });
      }
    }

    if (c.ringEnabled && tiers.openTabs) {
      const tabs = this.openTabSignatures(doc.uri.toString());
      if (tabs) {
        chunks.push({ tier: "openTabs", label: "open tab signatures", text: tabs });
      }
    }

    if (c.ringEnabled && tiers.yank && this.lastYank && this.lastYankDocument && !isExcludedDocument(this.lastYankDocument)) {
      chunks.push({ tier: "yank", label: "yank/selection", text: this.lastYank });
    }

    let redactedCount = 0;
    const prepared = chunks.map((chunk) => {
      if (chunk.tier === "target") return chunk;
      let text = chunk.text;
      if (c.redactSecrets) {
        const redacted = redactSecrets(text);
        text = redacted.text;
        redactedCount += redacted.count;
      }
      if (chunk.tier === "nearby") text = this.compressChunk(text, langProfile);
      if (chunk.tier === "yank") text = truncateLines(text, c.maxLineChars);
      return { ...chunk, text };
    });
    if (c.debug && redactedCount > 0) {
      this.output?.appendLine(`[privacy] redacted ${redactedCount} secret(s) from context`);
    }
    return orderContextChunks(prepared);
  }

  private compressChunk(text: string, profile?: LanguageProfile): string {
    let t = text
      .split("\n")
      .map((line) => /^>>> (TARGET LINE|CODE BLOCK) <<<$/.test(line) ? line : truncateLines(line, cfg().maxLineChars))
      .join("\n");
    t = stripBlankLines(t);
    t = collapseImports(t, profile?.lineCommentPrefixes[0] ?? "//");
    return t;
  }

  private openTabSignatures(excludeUri: string): string {
    const parts: string[] = [];
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === excludeUri || isExcludedDocument(ed.document)) {
        continue;
      }
      const lines = ed.document.getText().split("\n").slice(0, 120);
      const sigs = lines.filter((l) =>
        /^\s*(import |from |#include|class |def |function |func |interface |struct )/.test(l)
      );
      if (sigs.length > 0) {
        parts.push(`// ${ed.document.fileName}\n${collapseImports(sigs.slice(0, 12).join("\n"), PROFILES[ed.document.languageId]?.lineCommentPrefixes[0] ?? "//")}`);
      }
    }
    return dedupeChunks(parts).join("\n");
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

/** Format block supplementary context for LLM user message. */
/** Block prompt payload: read-only context first, then the one block the model may return. */
export function formatBlockWithContext(target: string, supplementary: string): string {
  // Label both parts: small models otherwise treat the context as code to fix and paste it into the reply.
  const block = `CODE block (reply with only this block):\n${target}`;
  if (!supplementary.trim()) {
    return block;
  }
  return `Context (read-only — never include it in your reply):\n${supplementary}\n\n${block}`;
}
