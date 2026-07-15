/** Prompt attributes for a staged block (set with D / F / X before E or Shift+E). */
export type StagedOp = "fix" | "docs" | "caveman";

export interface StagedAttributes {
  op: StagedOp;
  contextNote: string;
}

export class StagedSession {
  attributes: StagedAttributes = { op: "fix", contextNote: "" };

  resetAttributes(): void {
    this.attributes = { op: "fix", contextNote: "" };
  }

  setDocs(): void {
    this.attributes.op = "docs";
  }

  setCaveman(): void {
    this.attributes.op = "caveman";
  }

  setFix(): void {
    this.attributes.op = "fix";
  }

  setContext(note: string): void {
    this.attributes.contextNote = note.trim();
  }

  flagsLabel(): string {
    const parts: string[] = [this.attributes.op];
    if (this.attributes.contextNote) {
      const snip =
        this.attributes.contextNote.length > 36
          ? `${this.attributes.contextNote.slice(0, 36)}…`
          : this.attributes.contextNote;
      parts.push(`ctx:"${snip}"`);
    }
    return parts.join(" · ");
  }
}
