export interface RawChange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  addedLines: number;
}

/** Map a change's start line from pre-edit to post-edit document coordinates. */
export function postEditLine(changes: RawChange[], index: number): number {
  const target = changes[index];
  return changes.reduce((line, change, i) => {
    const before = change.endLine < target.startLine ||
      (change.endLine === target.startLine && change.endCharacter <= target.startCharacter);
    return i !== index && before
      ? line + change.addedLines - (change.endLine - change.startLine)
      : line;
  }, target.startLine);
}
