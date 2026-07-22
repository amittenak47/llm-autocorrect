import * as vscode from "vscode";
import { activeLlmProfile, cfg } from "./config";
import {
  AppliedChange,
  applyRegionReplace,
  ChangeLedger,
  FileApplyQueue,
  newChangeId,
  revertChange,
} from "./applyLedger";
import { shiftLine } from "./blockMath";
import { blockLineRange } from "./blockApply";
import { decorationLineNumbers } from "./queueDeco";
import { profileColor } from "./profiles";
import {
  baselineHash,
  canMergeRegions,
  LineRegion,
  normalizeRegion,
  regionContainsLine,
  regionsEqual,
  regionsOverlap,
  unionRegion,
  shiftRegion,
} from "./regionLock";
import { ContextTiers } from "./profiles";
import { StagedOp } from "./stagedSession";
import { StatusBar } from "./statusBar";
import { QueueExecutor } from "./queueExecutor";

export interface QueuedFix {
  id: string;
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
  /** Line region when enqueued — used to locate baseline after shifts. */
  anchorRegion: LineRegion;
  baselineHash: string;
}

interface QueueQuickPickItem extends vscode.QuickPickItem {
  fix: QueuedFix;
}

export class FixQueue implements vscode.Disposable {
  private fixes: QueuedFix[] = [];
  private executor: QueueExecutor | undefined;
  readonly ledger = new ChangeLedger();
  private readonly fileApply = new FileApplyQueue();
  private readonly profileDecos = new Map<string, vscode.TextEditorDecorationType>();
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

  async addLine(
    doc: vscode.TextDocument,
    line: number,
    original: string,
    corrected: string,
    profileId?: string
  ): Promise<boolean> {
    return this.add(doc, line, line, original, corrected, `line ${line + 1}`, "fix", "", profileId ?? activeLlmProfile().id, cfg().defaultTiers, false);
  }

  async addPendingLine(
    doc: vscode.TextDocument,
    line: number,
    original: string,
    profileId?: string,
    op: StagedOp = "fix",
    contextNote = "",
    tiers = cfg().defaultTiers
  ): Promise<boolean> {
    return this.add(doc, line, line, original, "", `line ${line + 1}`, op, contextNote, profileId ?? activeLlmProfile().id, tiers, true);
  }

  async addBlock(
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
  ): Promise<boolean> {
    return this.add(doc, startLine, endLine, original, corrected, label, op, contextNote, profileId ?? activeLlmProfile().id, tiers, false);
  }

  async addPendingBlock(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    original: string,
    label: string,
    op: StagedOp,
    contextNote: string,
    profileId: string,
    tiers: ContextTiers
  ): Promise<boolean> {
    return this.add(doc, startLine, endLine, original, "", label, op, contextNote, profileId, tiers, true);
  }

  /** Apply a surgical replace with per-file serialization and revert ledger entry. */
  async applyChange(
    doc: vscode.TextDocument,
    startLine: number,
    endLine: number,
    baseline: string,
    newText: string,
    meta: { profileId: string; op: StagedOp; label: string }
  ): Promise<boolean> {
    const uri = doc.uri.toString();
    const anchor = normalizeRegion(startLine, endLine);
    const hash = baselineHash(baseline);
    const ledgerConflict = this.ledgerConflict(uri, anchor);
    if (ledgerConflict) {
      const ok = await this.confirmRevertApplied(ledgerConflict);
      if (!ok) {
        return false;
      }
      await this.fileApply.enqueue(uri, () => revertChange(doc, ledgerConflict));
      this.ledger.remove(ledgerConflict.id);
    }

    const result = await this.fileApply.enqueue(uri, () =>
      applyRegionReplace(doc, anchor, baseline, newText, meta, this.ledger, hash)
    );
    return result.ok;
  }

  async removeAtCursor(editor: vscode.TextEditor): Promise<void> {
    const doc = editor.document;
    const uri = doc.uri.toString();
    const line = editor.selection.active.line;

    const fix = this.fixes.find(
      (f) => f.uri === uri && regionContainsLine(normalizeRegion(f.line, f.endLine), line)
    );
    if (fix) {
      this.fixes = this.fixes.filter((f) => f !== fix);
      this.sync();
      vscode.window.setStatusBarMessage(
        `Autocorrect: removed queued ${fix.op} (${fix.label})`,
        4000
      );
      this.output.appendLine(`[queue] removed ${fix.label} at cursor`);
      return;
    }

    const applied = this.ledger.findAtLine(uri, line);
    if (applied) {
      const ok = await this.fileApply.enqueue(uri, () => revertChange(doc, applied));
      if (ok) {
        this.ledger.remove(applied.id);
        vscode.window.setStatusBarMessage(`Autocorrect: reverted ${applied.op} (${applied.label})`, 4000);
        this.output.appendLine(`[queue] reverted ${applied.label}`);
      } else {
        vscode.window.setStatusBarMessage(
          "Autocorrect: cannot revert — buffer changed since apply",
          5000
        );
      }
      return;
    }

    vscode.window.setStatusBarMessage("Autocorrect: no queued or revertible change at cursor", 3000);
  }

  private async add(
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
  ): Promise<boolean> {
    const uri = doc.uri.toString();
    const region = normalizeRegion(startLine, endLine);
    const hash = baselineHash(original);

    const exact = this.fixes.find(
      (f) => f.uri === uri && regionsEqual(region, normalizeRegion(f.line, f.endLine))
    );

    const queueOverlap = this.fixes.find(
      (f) =>
        f.uri === uri &&
        f.id !== exact?.id &&
        regionsOverlap(region, normalizeRegion(f.line, f.endLine))
    );

    const queueMerge = this.fixes.find(
      (f) =>
        f.uri === uri &&
        f.profileId === profileId &&
        f.id !== exact?.id &&
        canMergeRegions(region, normalizeRegion(f.line, f.endLine))
    );

    const appliedOverlap = this.ledgerConflict(uri, region);

    if (appliedOverlap) {
      const revert = await this.confirmRevertApplied(appliedOverlap);
      if (!revert) {
        return false;
      }
      await this.fileApply.enqueue(uri, () => revertChange(doc, appliedOverlap));
      this.ledger.remove(appliedOverlap.id);
    }

    if (exact && exact.profileId !== profileId) {
      const replace = await this.confirmReplaceQueue(exact, "Another profile already queued this exact range.");
      if (!replace) {
        return false;
      }
      this.fixes = this.fixes.filter((f) => f !== exact);
    } else if (queueOverlap && queueOverlap.profileId !== profileId) {
      const replace = await this.confirmReplaceQueue(
        queueOverlap,
        "This range overlaps a queued item for a different profile."
      );
      if (!replace) {
        return false;
      }
      this.fixes = this.fixes.filter((f) => f !== queueOverlap);
    } else if (queueMerge && queueMerge.profileId === profileId) {
      const action = await this.confirmMergeOrReplace(queueMerge, region);
      if (action === "cancel") {
        return false;
      }
      if (action === "merge") {
        return this.mergeInto(doc, queueMerge, region, {
          label,
          op,
          contextNote,
          profileId,
          tiers,
          pending,
          corrected,
        });
      }
      this.fixes = this.fixes.filter((f) => f !== queueMerge);
    } else if (exact && exact.profileId === profileId) {
      const update = await vscode.window.showWarningMessage(
        `Lines ${region.startLine + 1}-${region.endLine + 1} already queued for this profile. Update the queued item?`,
        { modal: true },
        "Update",
        "Cancel"
      );
      if (update !== "Update") {
        return false;
      }
    }

    const existing = this.fixes.find(
      (f) => f.uri === uri && regionsEqual(region, normalizeRegion(f.line, f.endLine)) && f.profileId === profileId
    );

    const entry: QueuedFix = {
      id: existing?.id ?? newChangeId(),
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
      anchorRegion: { ...region },
      baselineHash: hash,
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
    return true;
  }

  private async mergeInto(
    doc: vscode.TextDocument,
    existing: QueuedFix,
    newRegion: LineRegion,
    next: {
      label: string;
      op: StagedOp;
      contextNote: string;
      profileId: string;
      tiers: ContextTiers;
      pending: boolean;
      corrected: string;
    }
  ): Promise<boolean> {
    const merged = unionRegion(normalizeRegion(existing.line, existing.endLine), newRegion);
    const range = blockLineRange(doc, merged.startLine, merged.endLine);
    const original = doc.getText(range);
    existing.line = merged.startLine;
    existing.endLine = merged.endLine === merged.startLine ? undefined : merged.endLine;
    existing.anchorRegion = { ...merged };
    existing.original = original;
    existing.baselineHash = baselineHash(original);
    existing.label = next.label;
    existing.op = next.op;
    existing.contextNote = next.contextNote;
    existing.tiers = { ...next.tiers };
    existing.pending = true;
    existing.corrected = "";
    this.output.appendLine(
      `[queue] merged to ${doc.fileName}:${merged.startLine + 1}-${merged.endLine + 1} (re-run LLM on Q)`
    );
    this.sync();
    return true;
  }

  private async confirmReplaceQueue(existing: QueuedFix, detail: string): Promise<boolean> {
    const profiles = cfg().profiles;
    const pl = profiles.find((p) => p.id === existing.profileId);
    const region = normalizeRegion(existing.line, existing.endLine);
    const choice = await vscode.window.showWarningMessage(
      `${detail} Replace the queued item [${pl?.label ?? existing.profileId}] on lines ${region.startLine + 1}-${region.endLine + 1}?`,
      { modal: true },
      "Replace",
      "Cancel"
    );
    return choice === "Replace";
  }

  private async confirmMergeOrReplace(
    existing: QueuedFix,
    newRegion: LineRegion
  ): Promise<"merge" | "replace" | "cancel"> {
    const region = normalizeRegion(existing.line, existing.endLine);
    const merged = unionRegion(region, newRegion);
    const choice = await vscode.window.showWarningMessage(
      `This selection overlaps your queued item (lines ${region.startLine + 1}-${region.endLine + 1}). Expand to ${merged.startLine + 1}-${merged.endLine + 1} and re-queue?`,
      { modal: true },
      "Expand & merge",
      "Replace queued item",
      "Cancel"
    );
    if (choice === "Expand & merge") {
      return "merge";
    }
    if (choice === "Replace queued item") {
      return "replace";
    }
    return "cancel";
  }

  private async confirmRevertApplied(entry: AppliedChange): Promise<boolean> {
    const profiles = cfg().profiles;
    const pl = profiles.find((p) => p.id === entry.profileId);
    const choice = await vscode.window.showWarningMessage(
      `Lines ${entry.region.startLine + 1}-${entry.region.endLine + 1} already have an applied autocorrect fix [${pl?.label ?? entry.profileId}] in the revert ledger. Revert it and continue?`,
      { modal: true },
      "Revert & continue",
      "Cancel"
    );
    return choice === "Revert & continue";
  }

  private ledgerConflict(uri: string, region: LineRegion): AppliedChange | undefined {
    return this.ledger.list(uri).find((a) => regionsOverlap(region, a.region));
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
    const byUri = new Map<string, QueuedFix[]>();
    for (const f of toApply) {
      if (f.pending) {
        continue;
      }
      const list = byUri.get(f.uri) ?? [];
      list.push(f);
      byUri.set(f.uri, list);
    }

    let staged = 0;
    let stale = 0;
    for (const [uri, fixes] of byUri) {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
      if (!doc || doc.isClosed) {
        stale += fixes.length;
        continue;
      }
      const result = await this.fileApply.enqueue(uri, () => this.applyUriBatch(doc, fixes));
      staged += result.staged;
      stale += result.stale;
    }

    const handled = new Set(toApply);
    this.fixes = this.fixes.filter((f) => !handled.has(f));
    this.sync();

    const summary =
      `applied ${staged} change(s)` + (stale > 0 ? `, skipped ${stale} stale` : "");
    this.output.appendLine(`[queue] ${summary}`);
    vscode.window.setStatusBarMessage(`Autocorrect: ${summary}`, 4000);
  }

  private async applyUriBatch(
    doc: vscode.TextDocument,
    fixes: QueuedFix[]
  ): Promise<{ staged: number; stale: number }> {
    const sorted = [...fixes].sort((a, b) => a.anchorRegion.startLine - b.anchorRegion.startLine);
    let staged = 0;
    let stale = 0;

    for (const f of sorted) {
      const result = await applyRegionReplace(
        doc,
        f.anchorRegion,
        f.original,
        f.corrected,
        { profileId: f.profileId, op: f.op, label: f.label },
        this.ledger,
        f.baselineHash
      );
      if (!result.ok) {
        stale++;
        continue;
      }
      staged++;
    }
    return { staged, stale };
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
          } else if (change.range.end.line < f.line) {
            const addedLines = change.text.split(/\r?\n/).length - 1;
            const removed = change.range.end.line - change.range.start.line;
            const delta = addedLines - removed;
            if (delta !== 0) {
              f.line += delta;
              f.endLine = (f.endLine ?? f.line) + delta;
              f.anchorRegion = shiftRegion(f.anchorRegion, delta);
            }
          }
          continue;
        }
        const shifted = shiftLine(
          f.line,
          change.range.start.line,
          change.range.end.line,
          addedLines
        );
        const lineDelta = shifted.line - f.line;
        f.line = shifted.line;
        if (!shifted.touched && lineDelta !== 0) {
          f.anchorRegion = shiftRegion(f.anchorRegion, lineDelta);
        }
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
      const readyByProfile = new Map<string, vscode.Range[]>();
      const pendingByProfile = new Map<string, vscode.Range[]>();
      const gutterRanges: vscode.Range[] = [];

      for (const f of this.fixes.filter((x) => x.uri === uri && x.line < doc.lineCount)) {
        const lineNums = decorationLineNumbers(f);
        const bucket = f.pending ? pendingByProfile : readyByProfile;
        const list = bucket.get(f.profileId) ?? [];
        for (const ln of lineNums) {
          if (ln < doc.lineCount) {
            list.push(new vscode.Range(ln, 0, ln, Math.max(1, doc.lineAt(ln).text.length)));
          }
        }
        bucket.set(f.profileId, list);
        if (lineNums.length > 0) {
          gutterRanges.push(new vscode.Range(lineNums[0], 0, lineNums[lineNums.length - 1], 0));
        }
      }

      editor.setDecorations(this.lineDecoration, []);
      editor.setDecorations(this.pendingLineDecoration, []);
      for (const [profileId, ranges] of readyByProfile) {
        editor.setDecorations(this.profileDeco(profileId, false), ranges);
      }
      for (const [profileId, ranges] of pendingByProfile) {
        editor.setDecorations(this.profileDeco(profileId, true), ranges);
      }
      editor.setDecorations(this.gutterDecoration, gutterRanges);
    }
  }

  private profileDeco(profileId: string, pending: boolean): vscode.TextEditorDecorationType {
    const key = `${profileId}:${pending ? "p" : "r"}`;
    let deco = this.profileDecos.get(key);
    if (!deco) {
      const profiles = cfg().profiles;
      const idx = profiles.findIndex((p) => p.id === profileId);
      const prof = profiles[idx] ?? profiles[0];
      const color = profileColor(prof, Math.max(0, idx));
      deco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: pending ? "rgba(140, 180, 255, 0.08)" : "rgba(255, 200, 100, 0.1)",
        borderWidth: "0 0 0 3px",
        borderStyle: pending ? "dotted" : "dashed",
        borderColor: color,
        overviewRulerColor: color,
        overviewRulerLane: vscode.OverviewRulerLane.Right,
      });
      this.profileDecos.set(key, deco);
    }
    return deco;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    for (const d of this.profileDecos.values()) {
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
