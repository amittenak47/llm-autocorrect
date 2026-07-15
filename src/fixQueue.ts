import * as vscode from "vscode";
import { shiftLine } from "./blockMath";
import { StagedOp } from "./stagedSession";
import { StatusBar } from "./statusBar";

interface QueuedFix {
  uri: string;
  fileName: string;
  label: string;
  original: string;
  corrected: string;
  op: StagedOp;
  contextNote: string;
  line: number;
  endLine?: number;
}

interface QueueQuickPickItem extends vscode.QuickPickItem {
  fix: QueuedFix;
}

export class FixQueue implements vscode.Disposable {
  private fixes: QueuedFix[] = [];
  private readonly decoration: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly statusBar: StatusBar,
    private readonly output: vscode.OutputChannel
  ) {
    this.decoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(255, 200, 100, 0.10)",
      border: "1px dashed rgba(255, 200, 100, 0.45)",
      overviewRulerColor: "rgba(255, 200, 100, 0.8)",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
    });
    this.disposables.push(
      this.decoration,
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.redecorateAll()),
      vscode.workspace.onDidCloseTextDocument((doc) => this.dropFor(doc.uri))
    );
  }

  get size(): number {
    return this.fixes.length;
  }

  addLine(doc: vscode.TextDocument, line: number, original: string, corrected: string): void {
    this.add(doc, line, line, original, corrected, `line ${line + 1}`, "fix", "");
  }

  addBlock(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    corrected: string,
    label: string,
    op: StagedOp,
    contextNote: string
  ): void {
    this.add(doc, startLine, endLine, original, corrected, label, op, contextNote);
  }

  private add(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    corrected: string,
    label: string,
    op: StagedOp,
    contextNote: string
  ): void {
    const uri = doc.uri.toString();
    const existing = this.fixes.find(
      (f) => f.uri === uri && f.line === startLine && f.endLine === endLine
    );
    const entry: QueuedFix = {
      uri,
      fileName: doc.fileName,
      label,
      original,
      corrected,
      op,
      contextNote,
      line: startLine,
      endLine: endLine === startLine ? undefined : endLine,
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      this.fixes.push(entry);
    }
    this.output.appendLine(`[queue] ${doc.fileName} queued ${label} (${this.fixes.length} pending)`);
    this.sync();
  }

  async review(): Promise<void> {
    if (this.fixes.length === 0) {
      vscode.window.setStatusBarMessage("Autocorrect: queue empty", 3000);
      return;
    }
    const items: QueueQuickPickItem[] = this.fixes.map((f) => ({
      label: `$(edit) ${shortName(f.fileName)} — ${f.op}`,
      description: queueDescription(f),
      detail: f.contextNote || undefined,
      picked: true,
      fix: f,
    }));
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: "Autocorrect: queued fixes",
      placeHolder: "Enter applies checked; unchecked are discarded; Esc keeps queue",
    });
    if (!chosen) {
      return;
    }
    const keep = new Set(chosen.map((i) => i.fix));
    const rejected = this.fixes.filter((f) => !keep.has(f));
    if (rejected.length > 0) {
      this.output.appendLine(`[queue] discarded ${rejected.length} item(s) after review`);
    }
    this.fixes = this.fixes.filter((f) => keep.has(f));
    this.sync();
    await this.apply([...keep]);
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
    return new vscode.Range(
      f.line, 0,
      end, doc.lineAt(end).text.length
    );
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
        const shifted = shiftLine(f.line, change.range.start.line, change.range.end.line, addedLines);
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
    this.statusBar.setQueueCount(this.fixes.length);
    this.redecorateAll();
  }

  private redecorateAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      const ranges = this.fixes
        .filter((f) => f.uri === uri && f.line < editor.document.lineCount)
        .map((f) => {
          const end = f.endLine ?? f.line;
          const doc = editor.document;
          if (end >= doc.lineCount) {
            return new vscode.Range(f.line, 0, f.line, 0);
          }
          return new vscode.Range(f.line, 0, end, doc.lineAt(end).text.length);
        });
      editor.setDecorations(this.decoration, ranges);
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
