import { chainLabel } from "./stagedChain";
import { ContextTiers, DEFAULT_CONTEXT_TIERS } from "./profiles";

/** Prompt attributes for a staged block (set with D / F / X / 1-5 / M before E or Shift+E). */
export type StagedOp = "fix" | "docs" | "caveman";

export interface StagedAttributes {
  op: StagedOp;
  then: StagedOp[];
  contextNote: string;
  tiers: ContextTiers;
  profileId: string;
}

export class StagedSession {
  attributes: StagedAttributes = StagedSession.defaultAttributes("default");

  static defaultAttributes(profileId: string): StagedAttributes {
    return {
      op: "fix",
      then: [],
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

  /** D: docs becomes the op; pressing D again (docs already the op) switches back to fix. */
  setDocs(): void {
    if (this.attributes.op === "docs") {
      this.setFix();
      return;
    }
    this.attributes.op = "docs";
    this.attributes.then = this.attributes.then.filter((step) => step !== "docs");
  }

  /** F: caveman becomes the op; pressing F again (caveman already the op) switches back to fix. */
  setCaveman(): void {
    if (this.attributes.op === "caveman") {
      this.setFix();
      return;
    }
    this.attributes.op = "caveman";
    this.attributes.then = this.attributes.then.filter((step) => step !== "caveman");
  }

  setFix(): void {
    this.attributes.op = "fix";
    this.attributes.then = this.attributes.then.filter((step) => step !== "fix");
  }

  toggleThen(op: StagedOp): string | undefined {
    if (op === this.attributes.op) {
      return `Autocorrect: ${op} is already the main op`;
    }
    const index = this.attributes.then.indexOf(op);
    if (index !== -1) {
      this.attributes.then.splice(index, 1);
    } else if (this.attributes.then.length < 2) {
      this.attributes.then.push(op);
    }
    return undefined;
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
    const parts: string[] = [chainLabel(this.attributes.op, this.attributes.then)];
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
