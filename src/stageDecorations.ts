import * as vscode from "vscode";
import { cfg } from "./config";
import { profileColor } from "./profiles";
import { opMarkerTexts } from "./stageBadge";
import { StagedAttributes, StagedOp } from "./stagedSession";

/** Op marker colours. */
const OP_COLORS: Record<StagedOp, string> = {
  fix: "#4a9eff",
  docs: "#a78bfa",
  caveman: "#fb923c",
};

const TIER_COLORS = [
  "rgba(45, 212, 191, 0.9)",
  "rgba(96, 165, 250, 0.9)",
  "rgba(244, 114, 182, 0.9)",
  "rgba(250, 204, 21, 0.9)",
  "rgba(148, 163, 184, 0.9)",
];

const TIER_NAMES = ["nearby", "signature", "recent edits", "open tabs", "selection"];

/** A chain has at most three steps (main op + two follow-ups). */
const MAX_OPS = 3;

/**
 * Staged-block markers, drawn horizontally before the first staged line so a whole chain is visible:
 * the ops in run order ("fix → docs", or "✓ D" with `staged.markerStyle: "letters"`), then the active
 * context-tier digits. The left border colour is the LLM profile.
 */
export class StageDecorations implements vscode.Disposable {
  private readonly profileBorder: vscode.TextEditorDecorationType;
  private borderDeco: vscode.TextEditorDecorationType | undefined;
  // Decoration types render their `before` content in creation order: ops first, then tiers.
  private readonly opMarks: vscode.TextEditorDecorationType[] = [];
  private readonly tierMarks: vscode.TextEditorDecorationType[] = [];
  private stagedRange: vscode.Range | undefined;
  private stagedUri: string | undefined;
  private attrs: StagedAttributes | undefined;

  constructor() {
    this.profileBorder = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderWidth: "0 0 0 4px",
      borderStyle: "solid",
    });
    for (let i = 0; i < MAX_OPS; i++) {
      this.opMarks.push(
        vscode.window.createTextEditorDecorationType({
          before: { margin: "0 0.35em 0 0", fontWeight: "bold" },
        })
      );
    }
    for (let i = 0; i < 5; i++) {
      this.tierMarks.push(
        vscode.window.createTextEditorDecorationType({
          before: {
            contentText: String(i + 1),
            color: TIER_COLORS[i],
            margin: i === 0 ? "0 0.2em 0 0.3em" : "0 0.2em 0 0",
            fontWeight: "bold",
          },
        })
      );
    }
  }

  setStaged(
    editor: vscode.TextEditor | undefined,
    range: vscode.Range | undefined,
    attrs: StagedAttributes | undefined
  ): void {
    this.stagedRange = range;
    this.stagedUri = editor?.document.uri.toString();
    this.attrs = attrs;
    this.paint();
  }

  clear(): void {
    this.stagedRange = undefined;
    this.stagedUri = undefined;
    this.attrs = undefined;
    this.paint();
  }

  /** Repaint with current settings (e.g. after `staged.markerStyle` changes). */
  refresh(): void {
    this.paint();
  }

  private clearEditor(editor: vscode.TextEditor): void {
    editor.setDecorations(this.profileBorder, []);
    for (const d of [...this.opMarks, ...this.tierMarks]) {
      editor.setDecorations(d, []);
    }
  }

  private paint(): void {
    this.borderDeco?.dispose();
    this.borderDeco = undefined;
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      if (uri !== this.stagedUri || !this.stagedRange || !this.attrs) {
        this.clearEditor(editor);
        continue;
      }
      const profiles = cfg().profiles;
      const pIdx = profiles.findIndex((p) => p.id === this.attrs!.profileId);
      const prof = profiles[pIdx] ?? profiles[0];
      const color = profileColor(prof, Math.max(0, pIdx));
      const borderDeco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: "0 0 0 4px",
        borderStyle: "solid",
        borderColor: color,
      });
      const lines: vscode.Range[] = [];
      for (let ln = this.stagedRange.start.line; ln <= this.stagedRange.end.line; ln++) {
        lines.push(new vscode.Range(ln, 0, ln, 0));
      }
      editor.setDecorations(borderDeco, lines);
      this.borderDeco = borderDeco;

      const first = new vscode.Range(this.stagedRange.start.line, 0, this.stagedRange.start.line, 0);
      const ops = [this.attrs.op, ...(this.attrs.then ?? [])];
      const texts = opMarkerTexts(ops, cfg().stagedMarkerStyle);
      const tiers = this.attrs.tiers;
      const tierList = [tiers.nearby, tiers.signature, tiers.recentEdits, tiers.openTabs, tiers.yank];
      const activeTiers = tierList.map((on, i) => (on ? `${i + 1} ${TIER_NAMES[i]}` : "")).filter(Boolean);
      const hover = new vscode.MarkdownString(
        `**Staged:** ${ops.join(" → ")} · profile ${prof?.label ?? this.attrs.profileId}\n\n` +
          `Context tiers: ${activeTiers.join(", ") || "none"}` +
          (this.attrs.contextNote ? `\n\nInstruction (X): ${this.attrs.contextNote}` : "")
      );
      for (let i = 0; i < MAX_OPS; i++) {
        const op = ops[i];
        editor.setDecorations(this.opMarks[i], op
          ? [{
            range: first,
            hoverMessage: i === 0 ? hover : undefined,
            renderOptions: { before: { contentText: texts[i], color: OP_COLORS[op] } },
          }]
          : []);
      }
      for (let i = 0; i < 5; i++) {
        editor.setDecorations(this.tierMarks[i], tierList[i] ? [first] : []);
      }
    }
  }

  dispose(): void {
    this.borderDeco?.dispose();
    this.profileBorder.dispose();
    for (const d of [...this.opMarks, ...this.tierMarks]) {
      d.dispose();
    }
  }
}
