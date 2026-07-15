import { ContextTiers, DEFAULT_CONTEXT_TIERS } from "./profiles";

/** Prompt attributes for a staged block (set with D / F / X / 1-5 / M before E or Shift+E). */
export type StagedOp = "fix" | "docs" | "caveman";

export interface StagedAttributes {
  op: StagedOp;
  contextNote: string;
  tiers: ContextTiers;
  profileId: string;
}

export class StagedSession {
  attributes: StagedAttributes = StagedSession.defaultAttributes("default");

  static defaultAttributes(profileId: string): StagedAttributes {
    return {
      op: "fix",
      contextNote: "",
      tiers: { ...DEFAULT_CONTEXT_TIERS },
      profileId,
    };
  }

  resetAttributes(profileId: string, tiers?: ContextTiers): void {
    this.attributes = StagedSession.defaultAttributes(profileId);
    if (tiers) {
      this.attributes.tiers = { ...tiers };
    }
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

  setProfileId(id: string): void {
    this.attributes.profileId = id;
  }

  toggleTier(n: 1 | 2 | 3 | 4 | 5): void {
    const map: Record<number, keyof ContextTiers> = {
      1: "nearby",
      2: "signature",
      3: "recentEdits",
      4: "openTabs",
      5: "yank",
    };
    const key = map[n];
    if (key) {
      this.attributes.tiers[key] = !this.attributes.tiers[key];
    }
  }

  activeTierNumbers(): number[] {
    const t = this.attributes.tiers;
    const out: number[] = [];
    if (t.nearby) out.push(1);
    if (t.signature) out.push(2);
    if (t.recentEdits) out.push(3);
    if (t.openTabs) out.push(4);
    if (t.yank) out.push(5);
    return out;
  }

  flagsLabel(profileLabel?: string, tokenEst?: number): string {
    const parts: string[] = [this.attributes.op];
    if (profileLabel) {
      parts.push(`@${profileLabel}`);
    }
    const tiers = this.activeTierNumbers();
    if (tiers.length > 0) {
      parts.push(`ctx:${tiers.join("")}`);
    }
    if (this.attributes.contextNote) {
      const snip =
        this.attributes.contextNote.length > 24
          ? `${this.attributes.contextNote.slice(0, 24)}…`
          : this.attributes.contextNote;
      parts.push(`"${snip}"`);
    }
    if (tokenEst !== undefined && tokenEst > 0) {
      parts.push(`~${tokenEst}tok`);
    }
    return parts.join(" · ");
  }
}
