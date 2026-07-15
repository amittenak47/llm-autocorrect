import * as vscode from "vscode";
import { activeLlmProfile, cfg } from "./config";
import { shiftLine } from "./blockMath";
import { decorationLineNumbers } from "./queueDeco";
import { profileColor } from "./profiles";
import { StagedOp } from "./stagedSession";
import { StatusBar } from "./statusBar";

export interface QueuedFix {
  uri: string;
  fileName: string;
  label: string;
  original: string;
  corrected: string;
  op: StagedOp;
  contextNote: string;
  profileId: string;
  line: number;
  endLine?: number;
}

interface QueueQuickPickItem extends vscode.QuickPickItem {
  fix: QueuedFix;
}

export class FixQueue implements vscode.Disposable {
  private fixes: QueuedFix[] = [];
  private readonly lineDecoration: vscode.TextEditorDecorationType;
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
    this.gutterDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(255, 200, 100, 0.06)",
    });
    this.disposables.push(
      this.lineDecoration,
      this.gutterDecoration,
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.redecorateAll()),
      vscode.workspace.onDidCloseTextDocument((doc) => this.dropFor(doc.uri))
    );
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
    this.add(
      doc,
      line,
      line,
      original,
      corrected,
      `line ${line + 1}`,
      "fix",
      "",
      profileId ?? activeLlmProfile().id
    );
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
    profileId?: string
  ): void {
    this.add(
      doc,
      startLine,
      endLine,
      original,
      corrected,
      label,
      op,
      contextNote,
      profileId ?? activeLlmProfile().id
    );
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
    profileId: string
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
      line: startLine,
      endLine: endLine === startLine ? undefined : endLine,
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      this.fixes.push(entry);
    }
    this.output.appendLine(
      `[queue] ${doc.fileName} [${profileId}] queued ${label} (${this.fixes.length} pending)`
    );
    this.sync();
  }

  async review(profileFilter?: string): Promise<void> {
    const pool = profileFilter
      ? this.fixes.filter((f) => f.profileId === profileFilter)
      : [...this.fixes];
    if (pool.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: queue empty", 3000);
      return;
    }
    const profiles = cfg().profiles;
    const items: QueueQuickPickItem[] = pool.map((f) => {
      const pl = profiles.find((p) => p.id === f.profileId);
      return {
        label: `$(edit) ${shortName(f.fileName)} — ${f.op} [${pl?.label ?? f.profileId}]`,
        description: queueDescription(f),
        detail: f.contextNote || undefined,
        picked: true,
        fix: f,
      };
    });
    const title = profileFilter
      ? `Autocorrect: queued fixes (${profileFilter})`
      : "Autocorrect: queued fixes (all profiles)";
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title,
      placeHolder: "Enter applies checked; unchecked are discarded; Esc keeps queue",
    });
    if (!chosen) {
      return;
    }
    const keep = new Set(chosen.map((i) => i.fix));
    const rejected = pool.filter((f) => !keep.has(f));
    if (rejected.length > 0) {
      this.output.appendLine(`[queue] discarded ${rejected.length} item(s) after review`);
    }
    this.fixes = this.fixes.filter((f) => !pool.includes(f) || keep.has(f));
    this.sync();
    await this.apply([...keep]);
  }

  async reviewActiveProfile(): Promise<void> {
    await this.review(activeLlmProfile().id);
  }

  async reviewAllProfiles(): Promise<void> {
    await this.review(undefined);
  }

  async applyAll(): Promise<void> {
    if (this.fixes.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: queue empty", 3000);
      return;
    }
    await this.apply([...this.fixes]);
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
      `applied ${ok ? staged : 0} item(s)` + (stale > 0 ? `, skipped ${stale} stale` : "");
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
    const profiles = cfg().profiles;
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      const doc = editor.document;
      const lineRanges: vscode.Range[] = [];
      const gutterRanges: vscode.Range[] = [];
      for (const f of this.fixes.filter((x) => x.uri === uri && x.line < doc.lineCount)) {
        const lineNums = decorationLineNumbers(f);
        const color = profileColor(
          profiles.find((p) => p.id === f.profileId) ?? profiles[0],
          profiles.findIndex((p) => p.id === f.profileId)
        );
        for (const ln of lineNums) {
          if (ln < doc.lineCount) {
            lineRanges.push(new vscode.Range(ln, 0, ln, Math.max(1, doc.lineAt(ln).text.length)));
          }
        }
        if (lineNums.length > 0) {
          const end = lineNums[lineNums.length - 1];
          gutterRanges.push(new vscode.Range(lineNums[0], 0, end, 0));
        }
        void color;
      }
      editor.setDecorations(this.lineDecoration, lineRanges);
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

function queueDescription(f: QueuedFix): string {
  const head = f.label.length > 50 ? `${f.label.slice(0, 50)}…` : f.label;
  return `${head} · ${preview(f.original, f.corrected)}`;
}
