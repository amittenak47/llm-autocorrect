import * as vscode from "vscode";
import { shiftLine } from "./blockMath";
import { StatusBar } from "./statusBar";

interface QueuedFix {
  uri: string;
  line: number;
  original: string;
  corrected: string;
  fileName: string;
}

interface QueueQuickPickItem extends vscode.QuickPickItem {
  fix: QueuedFix;
}

/**
 * Queued execution: with autocorrect.queue.enabled, line fixes are staged here
 * instead of being applied on Enter. Queued lines get a faint amber highlight;
 * the user reviews/applies them on their own schedule (QuickPick "window").
 *
 * Queued line numbers track buffer edits; a fix whose line was edited directly
 * is dropped once its text no longer matches what the LLM saw.
 */
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

  add(doc: vscode.TextDocument, line: number, original: string, corrected: string): void {
    const uri = doc.uri.toString();
    const existing = this.fixes.find((f) => f.uri === uri && f.line === line);
    if (existing) {
      existing.original = original;
      existing.corrected = corrected;
    } else {
      this.fixes.push({ uri, line, original, corrected, fileName: doc.fileName });
    }
    this.output.appendLine(
      `[queue] ${doc.fileName}:${line + 1} queued "${original.trim()}" -> "${corrected.trim()}" (${this.fixes.length} pending)`
    );
    this.sync();
  }

  /** Review "window": a multi-select QuickPick. Checked fixes apply, unchecked are discarded. */
  async review(): Promise<void> {
    if (this.fixes.length === 0) {
      void vscode.window.showInformationMessage("Autocorrect: the fix queue is empty.");
      return;
    }
    const items: QueueQuickPickItem[] = this.fixes.map((f) => ({
      label: `$(edit) ${shortName(f.fileName)}:${f.line + 1}`,
      description: `${f.original.trim()} → ${f.corrected.trim()}`,
      picked: true,
      fix: f,
    }));
    const chosen = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: "Autocorrect: queued fixes",
      placeHolder: "Enter applies checked fixes and discards unchecked ones; Esc keeps the queue",
    });
    if (!chosen) {
      return;
    }
    const keep = new Set(chosen.map((i) => i.fix));
    const rejected = this.fixes.filter((f) => !keep.has(f));
    if (rejected.length > 0) {
      this.output.appendLine(`[queue] discarded ${rejected.length} fix(es) after review`);
    }
    await this.apply([...keep]);
  }

  async applyAll(): Promise<void> {
    if (this.fixes.length === 0) {
      void vscode.window.showInformationMessage("Autocorrect: the fix queue is empty.");
      return;
    }
    await this.apply([...this.fixes]);
  }

  clear(): void {
    const n = this.fixes.length;
    this.fixes = [];
    this.sync();
    if (n > 0) {
      this.output.appendLine(`[queue] cleared ${n} fix(es)`);
    }
    vscode.window.setStatusBarMessage(`Autocorrect: cleared ${n} queued fix(es)`, 3000);
  }

  private async apply(toApply: QueuedFix[]): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    let staged = 0;
    let stale = 0;
    for (const f of toApply) {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === f.uri);
      if (!doc || doc.isClosed || f.line >= doc.lineCount || doc.lineAt(f.line).text !== f.original) {
        stale++;
        continue;
      }
      edit.replace(doc.uri, new vscode.Range(f.line, 0, f.line, f.original.length), f.corrected);
      staged++;
    }
    // Remove everything we handled before applying, so our own change events don't churn.
    const handled = new Set(toApply);
    this.fixes = this.fixes.filter((f) => !handled.has(f));
    this.sync();

    const ok = staged === 0 || (await vscode.workspace.applyEdit(edit));
    const summary =
      `applied ${ok ? staged : 0} fix(es)` + (stale > 0 ? `, skipped ${stale} stale` : "");
    this.output.appendLine(`[queue] ${summary}`);
    vscode.window.setStatusBarMessage(`Autocorrect: ${summary}`, 4000);
  }

  /** Keep queued line numbers in step with buffer edits; drop fixes the user overwrote. */
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
      const stillValid =
        f.line < e.document.lineCount && e.document.lineAt(f.line).text === f.original;
      if (!stillValid) {
        dropped++;
      }
      return stillValid;
    });
    if (dropped > 0) {
      this.output.appendLine(`[queue] dropped ${dropped} fix(es) — the line(s) were edited`);
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
        .map((f) => new vscode.Range(f.line, 0, f.line, 0));
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
