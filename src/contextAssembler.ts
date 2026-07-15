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
import { isCommentOrBlank, LanguageProfile } from "./languages";
import { estimateTokens } from "./promptLimits";
import { ContextTiers, LlmProfileConfig, tokenBudgetForPolicy } from "./profiles";

export interface AssembledContext {
  supplementary: string;
  estimatedTokens: number;
  includedTiers: string[];
}

export class ContextAssemblerService implements vscode.Disposable {
  private readonly editRing = new EditRing();
  private lastYank = "";
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        const sel = e.textEditor.selection;
        if (!sel.isEmpty) {
          const t = e.textEditor.document.getText(sel);
          if (t.length > 20 && t.length < 4000) {
            this.lastYank = t;
          }
        }
      })
    );
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    const uri = e.document.uri.toString();
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
    const chunks = this.buildChunks(doc, range.start.line, range.end.line, target, tiers, editor, true);
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
    llmProfile: LlmProfileConfig
  ): AssembledContext {
    const target = doc.lineAt(line).text;
    const budget = this.resolveBudget(llmProfile);
    const chunks = this.buildChunks(doc, line, line, target, tiers, undefined, false, profile);
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
    editor: vscode.TextEditor | undefined,
    isBlock: boolean,
    langProfile?: LanguageProfile
  ): ContextChunk[] {
    const c = cfg();
    const chunks: ContextChunk[] = [{ tier: "target", label: "target", text: target }];

    if (tiers.nearby) {
      const above: string[] = [];
      const from = Math.max(0, startLine - c.contextLines);
      for (let i = from; i < startLine; i++) {
        above.push(doc.lineAt(i).text);
      }
      const below: string[] = [];
      for (let i = endLine + 1; i <= Math.min(doc.lineCount - 1, endLine + c.contextLinesBelow); i++) {
        below.push(doc.lineAt(i).text);
      }
      const nearby = [...above, ...below].join("\n");
      if (nearby.trim()) {
        chunks.push({
          tier: "nearby",
          label: "nearby lines",
          text: this.compressChunk(nearby, langProfile),
        });
      }
    }

    if (tiers.signature && editor) {
      const sig = this.enclosingSignature(editor, startLine);
      if (sig) {
        chunks.push({ tier: "signature", label: "enclosing signature", text: sig });
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

    if (c.ringEnabled && tiers.yank && this.lastYank) {
      chunks.push({ tier: "yank", label: "yank/selection", text: truncateLines(this.lastYank, c.maxLineChars) });
    }

    return chunks;
  }

  private compressChunk(text: string, profile?: LanguageProfile): string {
    let t = truncateLines(text, cfg().maxLineChars);
    if (profile) {
      t = t
        .split("\n")
        .filter((l) => !isCommentOrBlank(l, profile) || l.trim().length > 0)
        .join("\n");
    }
    t = stripBlankLines(t);
    t = collapseImports(t);
    return t;
  }

  private enclosingSignature(editor: vscode.TextEditor, line: number): string | undefined {
    const doc = editor.document;
    const lineText = doc.lineAt(line).text;
    const classMatch = lineText.match(/^\s*(class|def|function|func|interface|struct|enum)\s+\w+/);
    if (classMatch) {
      return lineText.trim();
    }
    for (let i = line; i >= Math.max(0, line - 80); i--) {
      const t = doc.lineAt(i).text;
      if (/^\s*(class|def|function|func|interface|struct|enum)\s+\w+/.test(t)) {
        return t.trim();
      }
    }
    return undefined;
  }

  private openTabSignatures(excludeUri: string): string {
    const parts: string[] = [];
    for (const ed of vscode.window.visibleTextEditors) {
      if (ed.document.uri.toString() === excludeUri) {
        continue;
      }
      const lines = ed.document.getText().split("\n").slice(0, 120);
      const sigs = lines.filter((l) =>
        /^\s*(import |from |#include|class |def |function |func |interface |struct )/.test(l)
      );
      if (sigs.length > 0) {
        parts.push(`// ${ed.document.fileName}\n${collapseImports(sigs.slice(0, 12).join("\n"))}`);
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
export function formatBlockWithContext(target: string, supplementary: string): string {
  if (!supplementary.trim()) {
    return target;
  }
  return `${supplementary}\n\n--- Code ---\n${target}`;
}

/** Format line supplementary context before TARGET line section. */
export function formatLineWithContext(supplementary: string, contextAbove: string, target: string): string {
  const ctx = contextAbove || "(start of file)";
  let body = `Context (lines above the target):\n${ctx}\n\nTARGET line:\n${target}`;
  if (supplementary.trim()) {
    body = `${supplementary}\n\n${body}`;
  }
  return body;
}

export function estimateStagedTokens(
  editor: vscode.TextEditor,
  range: vscode.Range,
  tiers: ContextTiers,
  llmProfile: LlmProfileConfig
): number {
  const doc = editor.document;
  const target = doc.getText(range);
  return estimateTokens(target) + 64;
}
