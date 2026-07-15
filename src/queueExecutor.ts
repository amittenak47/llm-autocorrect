import * as vscode from "vscode";
import { blockLineRange } from "./blockApply";
import { cfg } from "./config";
import { QueuedFix } from "./fixQueue";
import { PROFILES } from "./languages";
import { LineCorrector } from "./lineCorrector";
import { StagedExecutor } from "./stagedExecutor";

/** Run a deferred queue task (LLM + immediate apply). */
export class QueueExecutor {
  constructor(
    private readonly staged: StagedExecutor,
    private readonly line: LineCorrector
  ) {}

  async execute(fix: QueuedFix): Promise<boolean> {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === fix.uri);
    if (!doc || doc.isClosed) {
      return false;
    }
    const langProfile = PROFILES[doc.languageId];
    if (!langProfile || !cfg().languages.includes(doc.languageId)) {
      return false;
    }

    if (fix.endLine === undefined) {
      return this.line.executeQueuedLine(fix);
    }

    let editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === fix.uri);
    if (!editor) {
      editor = await vscode.window.showTextDocument(doc, { preview: false });
    }
    const range = blockLineRange(doc, fix.line, fix.endLine);
    if (doc.getText(range) !== fix.original) {
      return false;
    }
    const result = await this.staged.run(
      editor,
      range,
      {
        op: fix.op,
        contextNote: fix.contextNote,
        tiers: fix.tiers,
        profileId: fix.profileId,
      },
      false
    );
    return result.ok;
  }
}
