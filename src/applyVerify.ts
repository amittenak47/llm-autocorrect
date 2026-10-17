export interface VerifyDiag {
  startLine: number;
  endLine: number;
  message: string;
  severity: number;
}

export type VerifyVerdict = "keep" | "revert" | "stillFailing" | "unknown";

export function verifyVerdict(opts: {
  before: VerifyDiag[];
  after: VerifyDiag[];
  region: { startLine: number; endLine: number };
  lineDelta: number;
  diagnosticsUpdated: boolean;
  /** Post-apply lines the user edited while we waited (e.g. half-typed code below the fix) — not the fix's fault. */
  ignoreLines?: number[];
  /** Parser errors all share one message, so compare counts and mapped locations instead of messages. */
  countOnly?: boolean;
}): VerifyVerdict {
  if (!opts.diagnosticsUpdated) {
    return "unknown";
  }
  const startLine = opts.region.startLine - 2;
  const endLine = opts.region.endLine + 2;
  const errorsIn = (diags: VerifyDiag[], start: number, end: number): VerifyDiag[] =>
    diags.filter((d) => d.severity === 0 && d.startLine <= end && d.endLine >= start);
  const ignored = new Set(opts.ignoreLines ?? []);
  const before = errorsIn(opts.before, startLine, endLine);
  const after = errorsIn(opts.after, startLine, endLine + opts.lineDelta).filter((d) => !ignored.has(d.startLine));
  if (opts.countOnly) {
    const regionEnd = opts.region.endLine + opts.lineDelta;
    const inRegion = (line: number): boolean => line >= opts.region.startLine && line <= regionEnd;
    const mapped = new Set(before.map((d) => d.startLine < opts.region.startLine ? d.startLine :
      d.startLine <= opts.region.endLine ? opts.region.startLine : d.startLine + opts.lineDelta));
    const newLocation = after.some((d) => !mapped.has(inRegion(d.startLine) ? opts.region.startLine : d.startLine));
    if (after.length > before.length || (newLocation && after.length >= before.length)) {
      return "revert";
    }
    const fixedLinesHadErrors = errorsIn(before, opts.region.startLine, opts.region.endLine).length > 0;
    return fixedLinesHadErrors && after.length === before.length ? "stillFailing" : "keep";
  }
  const beforeMessages = new Set(before.map((d) => d.message));
  const afterMessages = new Set(after.map((d) => d.message));
  const newMessage = after.some((d) => !beforeMessages.has(d.message));
  if (newMessage && after.length >= before.length) {
    return "revert";
  }
  const regionErrors = errorsIn(before, opts.region.startLine, opts.region.endLine);
  if (regionErrors.length > 0 && !newMessage && regionErrors.every((d) => afterMessages.has(d.message))) {
    return "stillFailing";
  }
  return "keep";
}
