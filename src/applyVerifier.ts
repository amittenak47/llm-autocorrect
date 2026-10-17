import * as vscode from "vscode";
import { AppliedChange } from "./applyLedger";
import { VerifyDiag, verifyVerdict } from "./applyVerify";
import { cfg } from "./config";
import { FixQueue } from "./fixQueue";
import { SyntaxChecker } from "./syntaxCheck";

export function snapshotDiagnostics(uri: vscode.Uri): VerifyDiag[] {
  return vscode.languages.getDiagnostics(uri).map((d) => ({
    startLine: d.range.start.line,
    endLine: d.range.end.line,
    message: d.message,
    severity: d.severity,
  }));
}

export async function snapshotParserDiagnostics(
  doc: vscode.TextDocument,
  syntaxChecker: SyntaxChecker
): Promise<VerifyDiag[] | undefined> {
  if (!cfg().syntaxUseParser || !syntaxChecker.supports(doc.languageId)) return undefined;
  const errors = await syntaxChecker.errors(doc.languageId, doc.getText());
  return errors?.map((error) => ({
    startLine: error.line,
    endLine: error.endLine,
    message: error.message,
    severity: 0,
  }));
}

export class ApplyVerifier {
  constructor(
    private readonly queue: FixQueue,
    private readonly output: vscode.OutputChannel,
    private readonly syntaxChecker: SyntaxChecker
  ) {}

  verify(
    doc: vscode.TextDocument,
    change: AppliedChange,
    beforeDiags: VerifyDiag[],
    beforeParser: VerifyDiag[] | undefined
  ): void {
    void this.run(doc, change, beforeDiags, beforeParser).catch((err) => {
      // Background verification must never interrupt editing, even during shutdown.
      try {
        this.output.appendLine(`[verify] failed: ${err instanceof Error ? err.message : String(err)}`);
      } catch {
        // The output channel may already be disposed.
      }
    });
  }

  private async run(
    doc: vscode.TextDocument,
    change: AppliedChange,
    before: VerifyDiag[],
    beforeParser: VerifyDiag[] | undefined
  ): Promise<void> {
    const region = { ...change.anchorRegion };
    const lineDelta = change.applied.split(/\r?\n/).length - change.baseline.split(/\r?\n/).length;
    const appliedEnd = region.endLine + lineDelta;
    // Track the user's edits while waiting: typing below the fix (the usual case right after Enter) produces
    // diagnostics that are not the fix's fault; an edit on or above the fix makes the line windows unreliable.
    const editedLines = new Set<number>();
    let disturbed = false;
    const editListener = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== doc.uri.toString()) {
        return;
      }
      for (const c of e.contentChanges) {
        if (c.range.start.line <= appliedEnd) {
          disturbed = true;
        }
        const added = c.text.split(/\r?\n/).length - 1;
        for (let l = c.range.start.line; l <= c.range.start.line + added; l++) {
          editedLines.add(l);
        }
      }
    });
    let diagnosticsUpdated: boolean;
    let after: VerifyDiag[];
    let parserMode = false;
    try {
      diagnosticsUpdated = await this.waitForDiagnostics(doc.uri, cfg().verifyWaitMs);
      after = snapshotDiagnostics(doc.uri);
      if (!diagnosticsUpdated && beforeParser !== undefined) {
        const parserAfter = await snapshotParserDiagnostics(doc, this.syntaxChecker);
        if (parserAfter !== undefined) {
          before = beforeParser;
          after = parserAfter;
          diagnosticsUpdated = true;
          parserMode = true;
        }
      }
    } finally {
      editListener.dispose();
    }
    const line = region.startLine + 1;
    if (disturbed) {
      if (cfg().debug) {
        this.output.appendLine(`[verify] fix on line ${line}: skipped — the fixed lines or lines above changed while waiting`);
      }
      return;
    }
    const verdict = verifyVerdict({ before, after, region, lineDelta, diagnosticsUpdated, ignoreLines: [...editedLines], countOnly: parserMode });
    if (verdict === "revert") {
      const beforeMessages = new Set(before.filter((d) => d.severity === 0 &&
        d.startLine <= region.endLine + 2 && d.endLine >= region.startLine - 2).map((d) => d.message));
      const introduced = after.find((d) => d.severity === 0 &&
        d.startLine <= region.endLine + 2 + lineDelta && d.endLine >= region.startLine - 2 &&
        !editedLines.has(d.startLine) && !beforeMessages.has(d.message));
      if (await this.queue.revertApplied(doc, change)) {
        this.output.appendLine(`[verify] reverted fix on ${change.fileName}:${line} — it introduced: ${introduced?.message ?? "a new error"}`);
        vscode.window.setStatusBarMessage(`Autocorrect: undid fix on line ${line} — it introduced a new error`, 5000);
      } else {
        this.output.appendLine(`[verify] skipped revert on ${change.fileName}:${line} — buffer changed since apply`);
      }
    } else if (verdict === "stillFailing") {
      this.output.appendLine(`[verify] fix on line ${line} left the error in place`);
    } else if (cfg().debug) {
      this.output.appendLine(`[verify] fix on line ${line}: ${verdict}`);
    }
  }

  private waitForDiagnostics(uri: vscode.Uri, waitMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let updated = false;
      let quietTimer: ReturnType<typeof setTimeout> | undefined;
      const done = (): void => {
        clearTimeout(deadline);
        clearTimeout(quietTimer);
        listener.dispose();
        resolve(updated);
      };
      const listener = vscode.languages.onDidChangeDiagnostics((e) => {
        if (!e.uris.some((changed) => changed.toString() === uri.toString())) {
          return;
        }
        updated = true;
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, 300);
      });
      const deadline = setTimeout(done, Math.max(0, waitMs));
    });
  }
}
