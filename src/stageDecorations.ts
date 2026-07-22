import * as vscode from "vscode";
import { cfg } from "./config";
import { profileColor } from "./profiles";
import { StagedAttributes } from "./stagedSession";

const OP_COLORS: Record<string, string> = {
  fix: "rgba(74, 158, 255, 0.35)",
  docs: "rgba(167, 139, 250, 0.35)",
  caveman: "rgba(251, 146, 60, 0.35)",
};

const OP_GUTTER_HEX: Record<string, string> = {
  fix: "#4a9eff",
  docs: "#a78bfa",
  caveman: "#fb923c",
};

function gutterDotUri(hex: string): vscode.Uri {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5" fill="${hex}"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

const TIER_COLORS = [
  "rgba(45, 212, 191, 0.5)",
  "rgba(96, 165, 250, 0.5)",
  "rgba(244, 114, 182, 0.5)",
  "rgba(250, 204, 21, 0.5)",
  "rgba(148, 163, 184, 0.5)",
];

export class StageDecorations implements vscode.Disposable {
  private readonly profileBorder: vscode.TextEditorDecorationType;
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
    for (let i = 0; i < 5; i++) {
      this.tierMarks.push(
        vscode.window.createTextEditorDecorationType({
          before: {
            contentText: String(i + 1),
            color: TIER_COLORS[i],
            margin: "0 0.2em 0 0",
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

  private paint(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      if (uri !== this.stagedUri || !this.stagedRange || !this.attrs) {
        editor.setDecorations(this.profileBorder, []);
        for (const d of this.tierMarks) {
          editor.setDecorations(d, []);
        }
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
      borderDeco.dispose();

      const opColor = OP_COLORS[this.attrs.op] ?? OP_COLORS.fix;
      const opHex = OP_GUTTER_HEX[this.attrs.op] ?? OP_GUTTER_HEX.fix;
      const opDeco = vscode.window.createTextEditorDecorationType({
        gutterIconPath: gutterDotUri(opHex),
        gutterIconSize: "75%",
        before: {
          contentText: "$(circle-filled)",
          color: opColor.replace("0.35", "1"),
          margin: "0 1ch 0 0",
          fontWeight: "bold",
        },
      });
      editor.setDecorations(opDeco, [new vscode.Range(this.stagedRange.start.line, 0, this.stagedRange.start.line, 0)]);
      opDeco.dispose();

      const tiers = this.attrs.tiers;
      const tierList = [tiers.nearby, tiers.signature, tiers.recentEdits, tiers.openTabs, tiers.yank];
      for (let i = 0; i < 5; i++) {
        if (tierList[i]) {
          editor.setDecorations(this.tierMarks[i], [
            new vscode.Range(this.stagedRange.start.line, 0, this.stagedRange.start.line, 0),
          ]);
        } else {
          editor.setDecorations(this.tierMarks[i], []);
        }
      }
    }
  }

  dispose(): void {
    this.profileBorder.dispose();
    for (const d of this.tierMarks) {
      d.dispose();
    }
  }
}
