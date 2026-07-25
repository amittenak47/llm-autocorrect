import * as vscode from "vscode";
import { cfg } from "./config";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diagnosticsOnLine(uri: vscode.Uri, line: number): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter(
    (d) =>
      d.severity <= vscode.DiagnosticSeverity.Warning &&
      d.range.start.line <= line &&
      line <= d.range.end.line
  );
}

function diagnosticsStartingOnLine(uri: vscode.Uri, line: number): vscode.Diagnostic[] {
  return vscode.languages.getDiagnostics(uri).filter(
    (d) =>
      d.severity <= vscode.DiagnosticSeverity.Warning && d.range.start.line === line
  );
}

/** Parse errors on the line below often cascade from a typo on the previous line. */
const CASCADE_DIAG = /unexpected indentation|can be used only within|is not defined/i;
const ROOT_DIAG =
  /expected expression|invalid syntax|unterminated|was never closed|statements must be separated/i;

/**
 * When line L only has cascade diagnostics (e.g. return outside broken def),
 * or a root diagnostic starts on a previous line and spans into L, fix upstream.
 */
export function resolveLineFixTarget(
  uri: vscode.Uri,
  doc: vscode.TextDocument,
  line: number
): number {
  const overlapping = diagnosticsOnLine(uri, line);
  if (overlapping.length === 0) {
    return line;
  }

  // Root error often starts on the previous line but its range covers this line
  // (e.g. "Expected expression" on `defn` spanning into the indented `return`).
  for (const d of overlapping) {
    if (d.range.start.line < line && ROOT_DIAG.test(d.message)) {
      return d.range.start.line;
    }
  }

  // Prefer diagnostics that *start* on this line so spanning root errors above
  // do not defeat cascade detection.
  const startingHere = diagnosticsStartingOnLine(uri, line);
  const forCascade = startingHere.length > 0 ? startingHere : overlapping;
  const allCascade = forCascade.every((d) => CASCADE_DIAG.test(d.message));
  if (!allCascade) {
    return line;
  }

  for (let prev = line - 1; prev >= 0 && prev >= line - 8; prev--) {
    const text = doc.lineAt(prev).text;
    if (text.trim().length === 0) {
      continue;
    }
    const prevStart = diagnosticsStartingOnLine(uri, prev);
    const prevDiags = prevStart.length > 0 ? prevStart : diagnosticsOnLine(uri, prev);
    if (prevDiags.length === 0) {
      continue;
    }
    const hasRoot = prevDiags.some((d) => ROOT_DIAG.test(d.message));
    if (hasRoot || prevDiags.some((d) => d.severity === vscode.DiagnosticSeverity.Error)) {
      return prev;
    }
  }
  return line;
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
  maxWaitMs: number
): Promise<{ found: boolean; elapsed: number }> {
  const start = Date.now();
  const deadline = start + maxWaitMs;
  while (Date.now() < deadline) {
    if (lineHasDiagnostic(uri, line)) {
      return { found: true, elapsed: Date.now() - start };
    }
    await sleep(200);
  }
  return { found: lineHasDiagnostic(uri, line), elapsed: Date.now() - start };
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
  output?: vscode.OutputChannel
): Promise<boolean> {
  const requireDiag = manual ? cfg().fixRequireDiagnostic : cfg().requireDiagnostic;
  if (!requireDiag) {
    return true;
  }
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
  const { found, elapsed } = await waitForLineDiagnostic(uri, line, waitMs);
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
  output?: vscode.OutputChannel
): boolean {
  if (!cfg().fixRequireDiagnostic) {
    return true;
  }
  const found = rangeHasDiagnostic(uri, startLine, endLine);
  if (!found && output) {
    output.appendLine(
      `[block] skip ${startLine + 1}-${endLine + 1}: no LSP squiggle in range ` +
        `(autocorrect.fix.requireDiagnostic)`
    );
  }
  return found;
}
