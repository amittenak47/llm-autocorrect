import * as vscode from "vscode";
import { blockLineRange } from "./blockApply";
import { LineRegion, lineDeltaAfterReplace, baselineHash, shiftRegion } from "./regionLock";
import { StagedOp } from "./stagedSession";

let nextId = 1;

export function newChangeId(): string {
  return `ac-${nextId++}-${Date.now()}`;
}

/** Revertible change written to the buffer (survives after queue item is removed). */
export interface AppliedChange {
  id: string;
  uri: string;
  fileName: string;
  region: LineRegion;
  anchorRegion: LineRegion;
  baselineHash: string;
  baseline: string;
  applied: string;
  profileId: string;
  op: StagedOp;
  label: string;
}

export class ChangeLedger {
  private readonly applied: AppliedChange[] = [];

  list(uri?: string): AppliedChange[] {
    return uri ? this.applied.filter((a) => a.uri === uri) : [...this.applied];
  }

  lockedRegions(uri: string): LineRegion[] {
    return this.applied.filter((a) => a.uri === uri).map((a) => ({ ...a.region }));
  }

  findAtLine(uri: string, line: number): AppliedChange | undefined {
    return this.applied.find(
      (a) => a.uri === uri && line >= a.region.startLine && line <= a.region.endLine
    );
  }

  record(entry: AppliedChange): void {
    this.applied.push(entry);
  }

  remove(id: string): AppliedChange | undefined {
    const idx = this.applied.findIndex((a) => a.id === id);
    if (idx < 0) {
      return undefined;
    }
    return this.applied.splice(idx, 1)[0];
  }

  clear(): void {
    this.applied.length = 0;
  }
}

/** Serialize buffer edits per file so parallel LLM applies do not race. */
export class FileApplyQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  enqueue<T>(uri: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(uri) ?? Promise.resolve();
    const run = prev.then(() => fn());
    this.tails.set(
      uri,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }
}

export interface ApplyReplaceResult {
  ok: boolean;
  stale?: boolean;
  applied?: AppliedChange;
  lineDelta?: number;
}

const BASELINE_SEARCH_RADIUS = 12;

/** Locate baseline near the enqueue anchor; closest line wins; rejects ambiguous duplicates. */
export function findRegionForBaseline(
  doc: vscode.TextDocument,
  anchor: LineRegion,
  baseline: string,
  expectedHash?: string
): LineRegion | undefined {
  if (doc.isClosed) {
    return undefined;
  }
  const hash = expectedHash ?? baselineHash(baseline);
  const matches: LineRegion[] = [];

  for (let delta = 0; delta <= BASELINE_SEARCH_RADIUS; delta++) {
    for (const sign of delta === 0 ? [0] : [-1, 1]) {
      const shifted = shiftRegion(anchor, sign * delta);
      if (shifted.startLine < 0 || shifted.endLine >= doc.lineCount) {
        continue;
      }
      const range = blockLineRange(doc, shifted.startLine, shifted.endLine);
      const text = doc.getText(range);
      if (text === baseline && baselineHash(text) === hash) {
        matches.push(shifted);
      }
    }
  }

  if (matches.length === 0) {
    return undefined;
  }

  const dist = (r: LineRegion) => Math.abs(r.startLine - anchor.startLine);
  matches.sort((a, b) => dist(a) - dist(b));
  const bestDist = dist(matches[0]);
  const tied = matches.filter((r) => dist(r) === bestDist);
  if (tied.length > 1) {
    return undefined;
  }
  return matches[0];
}

export async function applyRegionReplace(
  doc: vscode.TextDocument,
  anchor: LineRegion,
  baseline: string,
  newText: string,
  meta: { profileId: string; op: StagedOp; label: string },
  ledger: ChangeLedger,
  expectedHash?: string
): Promise<ApplyReplaceResult> {
  if (doc.isClosed) {
    return { ok: false, stale: true };
  }
  const hash = expectedHash ?? baselineHash(baseline);
  const located = findRegionForBaseline(doc, anchor, baseline, hash);
  if (!located) {
    return { ok: false, stale: true };
  }
  const range = blockLineRange(doc, located.startLine, located.endLine);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, newText);
  const ok = await vscode.workspace.applyEdit(edit);
  if (!ok) {
    return { ok: false };
  }

  const inLines = located.endLine - located.startLine + 1;
  const delta = lineDeltaAfterReplace(inLines, newText);
  const outLines = inLines + delta;
  const appliedRegion: LineRegion = {
    startLine: located.startLine,
    endLine: located.startLine + outLines - 1,
  };
  const entry: AppliedChange = {
    id: newChangeId(),
    uri: doc.uri.toString(),
    fileName: doc.fileName,
    region: appliedRegion,
    anchorRegion: { ...located },
    baselineHash: hash,
    baseline,
    applied: newText,
    profileId: meta.profileId,
    op: meta.op,
    label: meta.label,
  };
  ledger.record(entry);
  return { ok: true, applied: entry, lineDelta: delta };
}

export async function revertChange(
  doc: vscode.TextDocument,
  entry: AppliedChange
): Promise<boolean> {
  if (doc.isClosed || doc.uri.toString() !== entry.uri) {
    return false;
  }
  if (entry.region.endLine >= doc.lineCount) {
    return false;
  }
  const range = blockLineRange(doc, entry.region.startLine, entry.region.endLine);
  if (doc.getText(range) !== entry.applied) {
    return false;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, range, entry.baseline);
  return vscode.workspace.applyEdit(edit);
}
