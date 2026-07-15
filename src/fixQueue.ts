import * as vscode from "vscode";
import { activeLlmProfile, cfg } from "./config";
import { shiftLine } from "./blockMath";
import { decorationLineNumbers } from "./queueDeco";
import { ContextTiers } from "./profiles";
import { StagedOp } from "./stagedSession";
import { StatusBar } from "./statusBar";
import { QueueExecutor } from "./queueExecutor";

export interface QueuedFix {
  uri: string;
  fileName: string;
  label: string;
  original: string;
  corrected: string;
  op: StagedOp;
  contextNote: string;
  profileId: string;
  tiers: ContextTiers;
  pending: boolean;
  line: number;
  endLine?: number;
}

interface QueueQuickPickItem extends vscode.QuickPickItem {
  fix: QueuedFix;
}

export class FixQueue implements vscode.Disposable {
  private fixes: QueuedFix[] = [];
  private executor: QueueExecutor | undefined;
  private readonly lineDecoration: vscode.TextEditorDecorationType;
  private readonly pendingLineDecoration: vscode.TextEditorDecorationType;
  private readonly gutterDecoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly statusBar: StatusBar,
    private readonly output: vscode.OutputChannel
  ) {
    this.lineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(255, 200, 100, 0.12)",
      borderWidth: "0 0 0 3px",
      borderStyle: "dashed",
      borderColor: "rgba(255, 200, 100, 0.65)",
      overviewRulerColor: "rgba(255, 200, 100, 0.85)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.pendingLineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(140, 180, 255, 0.1)",
      borderWidth: "0 0 0 3px",
      borderStyle: "dotted",
      borderColor: "rgba(140, 180, 255, 0.7)",
      overviewRulerColor: "rgba(140, 180, 255, 0.85)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.gutterDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(255, 200, 100, 0.06)",
    });
    this.disposables.push(
      this.lineDecoration,
      this.pendingLineDecoration,
      this.gutterDecoration,
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.redecorateAll()),
      vscode.workspace.onDidCloseTextDocument((doc) => this.dropFor(doc.uri))
    );
  }

  setExecutor(executor: QueueExecutor): void {
    this.executor = executor;
  }

  get size(): number {
    return this.fixes.length;
  }

  countByProfile(): Map<string, number> {
    const m = new Map<string, number>();
    for (const f of this.fixes) {
      m.set(f.profileId, (m.get(f.profileId) ?? 0) + 1);
    }
    return m;
  }

  addLine(
    doc: vscode.TextDocument,
    line: number,
    original: string,
    corrected: string,
    profileId?: string
  ): void {
    this.add(doc, line, line, original, corrected, `line ${line + 1}`, "fix", "", profileId ?? activeLlmProfile().id, cfg().defaultTiers, false);
  }

  addPendingLine(
    doc: vscode.TextDocument,
    line: number,
    original: string,
    profileId?: string,
    op: StagedOp = "fix",
    contextNote = "",
    tiers = cfg().defaultTiers
  ): void {
    this.add(doc, line, line, original, "", `line ${line + 1}`, op, contextNote, profileId ?? activeLlmProfile().id, tiers, true);
  }

  addBlock(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    corrected: string,
    label: string,
    op: StagedOp,
    contextNote: string,
    profileId?: string,
    tiers = cfg().defaultTiers
  ): void {
    this.add(doc, startLine, endLine, original, corrected, label, op, contextNote, profileId ?? activeLlmProfile().id, tiers, false);
  }

  addPendingBlock(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    label: string,
    op: StagedOp,
    contextNote: string,
    profileId: string,
    tiers: ContextTiers
  ): void {
    this.add(doc, startLine, endLine, original, "", label, op, contextNote, profileId, tiers, true);
  }

  private add(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    corrected: string,
    label: string,
    op: StagedOp,
    contextNote: string,
    profileId: string,
    tiers: ContextTiers,
    pending: boolean
  ): void {
    const uri = doc.uri.toString();
    const existing = this.fixes.find(
      (f) =>
        f.uri === uri &&
        f.line === startLine &&
        f.endLine === (endLine === startLine ? undefined : endLine) &&
        f.profileId === profileId
    );
    const entry: QueuedFix = {
      uri,
      fileName: doc.fileName,
      label,
      original,
      corrected,
      op,
      contextNote,
      profileId,
      tiers: { ...tiers },
      pending,
      line: startLine,
      endLine: endLine === startLine ? undefined : endLine,
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      this.fixes.push(entry);
    }
    this.output.appendLine(
      `[queue] ${doc.fileName} [${profileId}] queued ${pending ? "task" : "change"} ${label} (${this.fixes.length} in queue)`
    );
    this.sync();
  }

  async review(profileFilter?: string): Promise<void> {
    if (cfg().queueMode === "deferExecution") {
      await this.reviewDeferredTasks(profileFilter);
    } else {
      await this.reviewChanges(profileFilter);
    }
  }

  private async reviewDeferredTasks(profileFilter?: string): Promise<void> {
    if (!this.executor) {
      vscode.window.showErrorMessage("Autocorrect: queue executor not ready");
      return;
    }
    const executor = this.executor;
    const pool = this.pendingPool(profileFilter);
    if (pool.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: no queued tasks", 3000);
      return;
    }
    const profiles = cfg().profiles;
    const items: QueueQuickPickItem[] = pool.map((f) => {
      const pl = profiles.find((p) => p.id === f.profileId);
      return {
        label: `$(play) ${shortName(f.fileName)} — ${f.op} [${pl?.label ?? f.profileId}]`,
        description: taskDescription(f),
        detail: f.contextNote || undefined,
        picked: true,
        fix: f,
      };
    });
    const title = profileFilter
      ? `Autocorrect: run queued tasks (${profileFilter})`
      : "Autocorrect: run queued tasks (all profiles)";
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title,
      placeHolder: "Enter runs checked tasks (LLM then apply); unchecked discarded; Esc keeps queue",
    });
    if (!chosen) {
      return;
    }
    const run = new Set(chosen.map((i) => i.fix));
    const rejected = pool.filter((f) => !run.has(f));
    if (rejected.length > 0) {
      this.output.appendLine(`[queue] discarded ${rejected.length} task(s)`);
    }
    this.fixes = this.fixes.filter((f) => !pool.includes(f) || run.has(f));

    const tasks = chosen.map((i) => i.fix);
    const outcomes = await Promise.all(
      tasks.map(async (fix) => ({
        fix,
        success: await executor.execute(fix),
      }))
    );

    let ok = 0;
    let failed = 0;
    for (const { fix, success } of outcomes) {
      if (success) {
        ok++;
        this.fixes = this.fixes.filter((f) => f !== fix);
      } else {
        failed++;
      }
    }
    this.sync();
    const summary =
      `ran ${ok} task(s)` +
      (failed > 0 ? `, ${failed} failed` : "") +
      (rejected.length > 0 ? `, ${rejected.length} discarded` : "");
    this.output.appendLine(`[queue] ${summary}`);
    vscode.window.setStatusBarMessage(`Autocorrect: ${summary}`, 5000);
  }

  private async reviewChanges(profileFilter?: string): Promise<void> {
    const pool = this.readyPool(profileFilter);
    if (pool.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: queue empty", 3000);
      return;
    }
    const profiles = cfg().profiles;
    const items: QueueQuickPickItem[] = pool.map((f) => {
      const pl = profiles.find((p) => p.id === f.profileId);
      return {
        label: `$(edit) ${shortName(f.fileName)} — ${f.op} [${pl?.label ?? f.profileId}]`,
        description: changeDescription(f),
        detail: f.contextNote || undefined,
        picked: true,
        fix: f,
      };
    });
    const title = profileFilter
      ? `Autocorrect: review queued changes (${profileFilter})`
      : "Autocorrect: review queued changes (all profiles)";
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title,
      placeHolder: "Enter applies checked changes; unchecked discarded; Esc keeps queue",
    });
    if (!chosen) {
      return;
    }
    const keep = new Set(chosen.map((i) => i.fix));
    const rejected = pool.filter((f) => !keep.has(f));
    if (rejected.length > 0) {
      this.output.appendLine(`[queue] discarded ${rejected.length} change(s) after review`);
    }
    this.fixes = this.fixes.filter((f) => !pool.includes(f) || keep.has(f));
    this.sync();
    await this.apply([...keep]);
  }

  private pendingPool(profileFilter?: string): QueuedFix[] {
    const pending = this.fixes.filter((f) => f.pending);
    return profileFilter ? pending.filter((f) => f.profileId === profileFilter) : pending;
  }

  private readyPool(profileFilter?: string): QueuedFix[] {
    const ready = this.fixes.filter((f) => !f.pending);
    return profileFilter ? ready.filter((f) => f.profileId === profileFilter) : ready;
  }

  async reviewActiveProfile(): Promise<void> {
    await this.review(activeLlmProfile().id);
  }

  async reviewAllProfiles(): Promise<void> {
    await this.review(undefined);
  }

  async applyAll(): Promise<void> {
    const ready = this.fixes.filter((f) => !f.pending);
    if (ready.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: no queued changes to apply", 3000);
      return;
    }
    await this.apply(ready);
  }

  clear(): void {
    const n = this.fixes.length;
    this.fixes = [];
    this.sync();
    if (n > 0) {
      this.output.appendLine(`[queue] cleared ${n} item(s)`);
    }
    vscode.window.setStatusBarMessage(`Autocorrect: cleared ${n} queued item(s)`, 3000);
  }

  private async apply(toApply: QueuedFix[]): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    let staged = 0;
    let stale = 0;
    for (const f of toApply) {
      if (f.pending) {
        continue;
      }
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === f.uri);
      if (!doc || doc.isClosed) {
        stale++;
        continue;
      }
      const range = this.fixRange(doc, f);
      if (!range || doc.getText(range) !== f.original) {
        stale++;
        continue;
      }
      edit.replace(doc.uri, range, f.corrected);
      staged++;
    }
    const handled = new Set(toApply);
    this.fixes = this.fixes.filter((f) => !handled.has(f));
    this.sync();

    const ok = staged === 0 || (await vscode.workspace.applyEdit(edit));
    const summary =
      `applied ${ok ? staged : 0} change(s)` + (stale > 0 ? `, skipped ${stale} stale` : "");
    this.output.appendLine(`[queue] ${summary}`);
    vscode.window.setStatusBarMessage(`Autocorrect: ${summary}`, 4000);
  }

  private fixRange(doc: vscode.TextDocument, f: QueuedFix): vscode.Range | undefined {
    const end = f.endLine ?? f.line;
    if (f.line >= doc.lineCount || end >= doc.lineCount) {
      return undefined;
    }
    if (f.endLine === undefined) {
      return new vscode.Range(f.line, 0, f.line, doc.lineAt(f.line).text.length);
    }
    return new vscode.Range(f.line, 0, end, doc.lineAt(end).text.length);
  }

  private onDocChange(e: vscode.TextDocumentChangeEvent): void {
    const uri = e.document.uri.toString();
    const docFixes = this.fixes.filter((f) => f.uri === uri);
    if (docFixes.length === 0) {
      return;
    }
    const touched = new Set<QueuedFix>();
    for (const change of e.contentChanges) {
      const addedLines = change.text.split(/\r?\n/).length - 1;
      for (const f of docFixes) {
        if (f.endLine !== undefined) {
          if (change.range.start.line <= f.endLine && change.range.end.line >= f.line) {
            touched.add(f);
          }
          continue;
        }
        const shifted = shiftLine(
          f.line,
          change.range.start.line,
          change.range.end.line,
          addedLines
        );
        f.line = shifted.line;
        if (shifted.touched) {
          touched.add(f);
        }
      }
    }
    let dropped = 0;
    this.fixes = this.fixes.filter((f) => {
      if (!touched.has(f)) {
        return true;
      }
      const range = this.fixRange(e.document, f);
      const stillValid = range !== undefined && e.document.getText(range) === f.original;
      if (!stillValid) {
        dropped++;
      }
      return stillValid;
    });
    if (dropped > 0) {
      this.output.appendLine(`[queue] dropped ${dropped} item(s) — buffer changed`);
    }
    this.sync();
  }

  private dropFor(uri: vscode.Uri): void {
    const key = uri.toString();
    const before = this.fixes.length;
    this.fixes = this.fixes.filter((f) => f.uri !== key);
    if (this.fixes.length !== before) {
      this.sync();
    }
  }

  private sync(): void {
    this.statusBar.setQueueSummary(this.fixes.length, this.countByProfile());
    this.redecorateAll();
  }

  private redecorateAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      const doc = editor.document;
      const readyRanges: vscode.Range[] = [];
      const pendingRanges: vscode.Range[] = [];
      const gutterRanges: vscode.Range[] = [];
      for (const f of this.fixes.filter((x) => x.uri === uri && x.line < doc.lineCount)) {
        const lineNums = decorationLineNumbers(f);
        const deco = f.pending ? pendingRanges : readyRanges;
        for (const ln of lineNums) {
          if (ln < doc.lineCount) {
            deco.push(new vscode.Range(ln, 0, ln, Math.max(1, doc.lineAt(ln).text.length)));
          }
        }
        if (lineNums.length > 0) {
          gutterRanges.push(new vscode.Range(lineNums[0], 0, lineNums[lineNums.length - 1], 0));
        }
      }
      editor.setDecorations(this.lineDecoration, readyRanges);
      editor.setDecorations(this.pendingLineDecoration, pendingRanges);
      editor.setDecorations(this.gutterDecoration, gutterRanges);
    }
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function shortName(fileName: string): string {
  const parts = fileName.split(/[\\/]/);
  return parts[parts.length - 1] || fileName;
}

function preview(original: string, corrected: string): string {
  const a = original.trim().replace(/\s+/g, " ").slice(0, 40);
  const b = corrected.trim().replace(/\s+/g, " ").slice(0, 40);
  return `${a} → ${b}`;
}

function changeDescription(f: QueuedFix): string {
  const head = f.label.length > 50 ? `${f.label.slice(0, 50)}…` : f.label;
  return `${head} · ${preview(f.original, f.corrected)}`;
}

function taskDescription(f: QueuedFix): string {
  const head = f.label.length > 50 ? `${f.label.slice(0, 50)}…` : f.label;
  const snippet = f.original.trim().replace(/\s+/g, " ").slice(0, 48);
  return `${head} · pending · ${snippet}`;
}
