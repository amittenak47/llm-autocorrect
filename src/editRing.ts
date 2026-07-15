/** Ring buffer of recent edit regions per file URI (no vscode dependency). */

export interface EditHunk {
  startLine: number;
  endLine: number;
  snippet: string;
}

export class EditRing {
  private readonly byUri = new Map<string, EditHunk[]>();
  private readonly maxPerFile: number;
  private readonly maxSnippetLines: number;

  constructor(maxPerFile = 5, maxSnippetLines = 8) {
    this.maxPerFile = maxPerFile;
    this.maxSnippetLines = maxSnippetLines;
  }

  record(uri: string, startLine: number, endLine: number, lines: string[]): void {
    if (lines.length === 0) {
      return;
    }
    const snippet = lines.slice(0, this.maxSnippetLines).join("\n");
    const list = this.byUri.get(uri) ?? [];
    list.unshift({ startLine, endLine, snippet });
    if (list.length > this.maxPerFile) {
      list.length = this.maxPerFile;
    }
    this.byUri.set(uri, list);
  }

  get(uri: string, excludeLine?: number): EditHunk[] {
    const list = this.byUri.get(uri) ?? [];
    if (excludeLine === undefined) {
      return [...list];
    }
    return list.filter((h) => h.endLine < excludeLine - 2 || h.startLine > excludeLine + 2);
  }

  clear(uri: string): void {
    this.byUri.delete(uri);
  }
}
