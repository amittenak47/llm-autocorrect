import * as vscode from "vscode";
import { cfg } from "./config";
import { DiagLike, resolveUpstreamTarget } from "./upstreamTarget";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    if (signal?.aborted) {
      done();
    }
  });
}

function diagnosticsOnLine(uri: vscode.Uri, line: number): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter(
    (d) =>
      d.severity <= vscode.DiagnosticSeverity.Warning &&
      d.range.start.line <= line &&
      line <= d.range.end.line
  );
}

export function resolveLineFixTarget(
  uri: vscode.Uri,
  doc: vscode.TextDocument,
  line: number,
  extraDiags: DiagLike[] = []
): number {
  const diags = vscode.languages.getDiagnostics(uri).map((d) => ({
    startLine: d.range.start.line,
    endLine: d.range.end.line,
    message: d.message,
    severity: d.severity,
  }));
  return resolveUpstreamTarget(line, [...diags, ...extraDiags], (i) => doc.lineAt(i).text, doc.languageId);
}

/** Previous non-blank line within a short lookback (fallback when LSP ranges are odd). */
export function previousNonBlankLine(doc: vscode.TextDocument, line: number, maxLookback = 8): number | undefined {
  for (let prev = line - 1; prev >= 0 && prev >= line - maxLookback; prev--) {
    if (doc.lineAt(prev).text.trim().length > 0) {
      return prev;
    }
  }
  return undefined;
}
export function lineHasDiagnostic(uri: vscode.Uri, line: number): boolean {
  return diagnosticsOnLine(uri, line).length > 0;
}

/** True if any line in [startLine, endLine] has an LSP error or warning. */
export function rangeHasDiagnostic(
  uri: vscode.Uri,
  startLine: number,
  endLine: number
): boolean {
  for (let line = startLine; line <= endLine; line++) {
    if (lineHasDiagnostic(uri, line)) {
      return true;
    }
  }
  return false;
}

export async function waitForLineDiagnostic(
  uri: vscode.Uri,
  line: number,
  maxWaitMs: number,
  signal?: AbortSignal
): Promise<{ found: boolean; elapsed: number }> {
  const start = Date.now();
  const deadline = start + maxWaitMs;
  while (!signal?.aborted && Date.now() < deadline) {
    if (lineHasDiagnostic(uri, line)) {
      return { found: true, elapsed: Date.now() - start };
    }
    await sleep(200, signal);
  }
  return { found: !signal?.aborted && lineHasDiagnostic(uri, line), elapsed: Date.now() - start };
}

export function describeDiagnostics(uri: vscode.Uri, line?: number): string[] {
  const diags = vscode.languages.getDiagnostics(uri);
  const filtered =
    line === undefined
      ? diags
      : diags.filter((d) => d.range.start.line <= line && line <= d.range.end.line);
  return filtered.map((d) => {
    const sev = vscode.DiagnosticSeverity[d.severity] ?? String(d.severity);
    const msg = d.message.split("\n")[0].slice(0, 100);
    return `L${d.range.start.line + 1} [${sev}] ${msg}`;
  });
}

/**
 * Enter-triggered line fix: wait for LSP squiggle when autocorrect.line.requireDiagnostic.
 * Manual fixes: optional gate when autocorrect.fix.requireDiagnostic.
 */
export async function shouldFixLine(
  uri: vscode.Uri,
  line: number,
  manual: boolean,
  output?: vscode.OutputChannel,
  signal?: AbortSignal,
  parserHasError?: () => Promise<boolean>
): Promise<boolean> {
  if (signal?.aborted) {
    return false;
  }
  const requireDiag = manual ? cfg().fixRequireDiagnostic : cfg().requireDiagnostic;
  if (!requireDiag) {
    return true;
  }
  if (await parserHasError?.()) {
    if (signal?.aborted) return false;
    output?.appendLine(`[line] diagnostic gate: parser found a syntax error on line ${line + 1}`);
    return true;
  }
  if (signal?.aborted) return false;
  if (manual) {
    const found = lineHasDiagnostic(uri, line);
    if (!found && output) {
      output.appendLine(
        `[line] skip line ${line + 1}: no LSP squiggle (autocorrect.fix.requireDiagnostic)`
      );
    }
    return found;
  }
  const waitMs = cfg().diagnosticWaitMs;
  if (output) {
    output.appendLine(
      `[line] diagnostic gate: waiting up to ${waitMs}ms for squiggle on line ${line + 1}`
    );
  }
  const { found, elapsed } = await waitForLineDiagnostic(uri, line, waitMs, signal);
  if (output) {
    if (found) {
      const squiggles = describeDiagnostics(uri, line);
      output.appendLine(
        `[line] diagnostic gate: passed after ${elapsed}ms — ${squiggles.join(" | ")}`
      );
    } else {
      const onLine = describeDiagnostics(uri, line);
      const inFile = describeDiagnostics(uri);
      output.appendLine(
        `[line] skip line ${line + 1}: no LSP squiggle within ${elapsed}ms (no API call made)`
      );
      output.appendLine(
        `[line]   squiggles on this line: ${onLine.length ? onLine.join(" | ") : "(none)"}`
      );
      if (inFile.length > 0) {
        output.appendLine(`[line]   squiggles in file: ${inFile.join(" | ")}`);
      }
      output.appendLine(
        "[line]   tip: set autocorrect.line.requireDiagnostic to false to fix lines without LSP errors on Enter"
      );
    }
  }
  return found;
}

/** Block / staged fix gate when autocorrect.fix.requireDiagnostic is set. */
export function shouldFixRange(
  uri: vscode.Uri,
  startLine: number,
  endLine: number,
  output?: vscode.OutputChannel,
  parserErrorLines?: number[]
): boolean {
  if (!cfg().fixRequireDiagnostic) {
    return true;
  }
  const found = parserErrorLines?.some((line) => startLine <= line && line <= endLine) ||
    rangeHasDiagnostic(uri, startLine, endLine);
  if (!found && output) {
    output.appendLine(
      `[block] skip ${startLine + 1}-${endLine + 1}: no LSP squiggle in range ` +
        `(autocorrect.fix.requireDiagnostic)`
    );
  }
  return found;
}
