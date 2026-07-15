import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { FixQueue } from "./fixQueue";
import { LineCorrector } from "./lineCorrector";
import {
  CAPTURE_ADJUST_MODE,
  MENU_MODE,
  STAGED_MODE,
  setModeContext,
} from "./modeContext";
import { StagedExecutor } from "./stagedExecutor";
import { StagedSession } from "./stagedSession";

const MENU_HINT =
  "Menu — A/C instant fix · Shift+A/C stage · S capture · Q review · Esc exit";
const CAPTURE_HINT = "Capture — WASD size · E finish · Esc cancel";
const STAGED_HINT =
  "Staged — D docs · F caveman · X context · E send · Shift+E queue · Esc cancel";

export class ModeController implements vscode.Disposable {
  readonly staged = new StagedSession();

  constructor(
    private readonly blockCapture: BlockCapture,
    private readonly stagedExecutor: StagedExecutor,
    private readonly lineCorrector: LineCorrector,
    private readonly fixQueue: FixQueue,
    private readonly output: vscode.OutputChannel
  ) {}

  async enterMenuMode(): Promise<void> {
    if (this.blockCapture.isKeyboardCapture()) {
      return;
    }
    await setModeContext(MENU_MODE, true);
    await setModeContext(CAPTURE_ADJUST_MODE, false);
    if (this.blockCapture.hasStagedBlock()) {
      await this.enterStagedMode(false);
    } else {
      await setModeContext(STAGED_MODE, false);
      vscode.window.setStatusBarMessage(MENU_HINT, 12_000);
    }
    this.output.appendLine("[mode] menu ON");
  }

  async enterStagedMode(resetAttrs: boolean): Promise<void> {
    await setModeContext(MENU_MODE, true);
    await setModeContext(STAGED_MODE, true);
    if (resetAttrs) {
      this.staged.resetAttributes();
    }
    this.refreshStagedHint();
  }

  async exitMenuMode(clearStaged = false): Promise<void> {
    await setModeContext(MENU_MODE, false);
    await setModeContext(STAGED_MODE, false);
    if (clearStaged) {
      this.blockCapture.clearStaged();
      this.staged.resetAttributes();
    }
  }

  async exitCaptureAdjustMode(): Promise<void> {
    await setModeContext(CAPTURE_ADJUST_MODE, false);
  }

  private refreshStagedHint(): void {
    vscode.window.setStatusBarMessage(
      `${STAGED_HINT} [${this.staged.flagsLabel()}]`,
      15_000
    );
  }

  async menuInstantBlock(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
      return;
    }
    const range =
      this.blockCapture.getStagedRange(editor) ??
      (editor.selection.isEmpty ? undefined : editor.selection);
    if (!range) {
      vscode.window.setStatusBarMessage("Autocorrect: select a block for A", 3000);
      return;
    }
    const attrs = { op: "fix" as const, contextNote: "" };
    const result = await this.stagedExecutor.run(editor, range, attrs, false);
    if (result.ok) {
      this.blockCapture.clearStaged();
      this.staged.resetAttributes();
      await this.exitMenuMode(false);
    }
  }

  async menuInstantLine(): Promise<void> {
    await this.lineCorrector.correctLineNearCursor(false);
    this.blockCapture.clearStaged();
    this.staged.resetAttributes();
    await this.exitMenuMode(false);
  }

  async menuStageBlock(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!this.blockCapture.stageFromSelection(editor)) {
      return;
    }
    await this.enterStagedMode(true);
  }

  async menuStageLine(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!this.blockCapture.stageLineNearCursor(editor)) {
      return;
    }
    await this.enterStagedMode(true);
  }

  async menuReviewQueue(): Promise<void> {
    await this.exitMenuMode(false);
    await this.fixQueue.review();
  }

  async stagedSetDocs(): Promise<void> {
    this.staged.setDocs();
    this.refreshStagedHint();
  }

  async stagedSetCaveman(): Promise<void> {
    this.staged.setCaveman();
    this.refreshStagedHint();
  }

  async stagedSetContext(): Promise<void> {
    const note = await vscode.window.showInputBox({
      title: "Autocorrect: context note",
      prompt: "Prepended to the staged block prompt (saved with queued items)",
      value: this.staged.attributes.contextNote,
      ignoreFocusOut: true,
    });
    if (note !== undefined) {
      this.staged.setContext(note);
      this.refreshStagedHint();
    }
  }

  async stagedSubmit(queue: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const range = this.blockCapture.getStagedRange(editor);
    if (!range) {
      vscode.window.setStatusBarMessage("Autocorrect: nothing staged", 3000);
      return;
    }
    const attrs = { ...this.staged.attributes };
    const result = await this.stagedExecutor.run(editor, range, attrs, queue);
    if (result.ok) {
      this.blockCapture.clearStaged();
      this.staged.resetAttributes();
      await this.exitMenuMode(false);
    }
  }

  async stagedCancel(): Promise<void> {
    this.blockCapture.clearStaged();
    this.staged.resetAttributes();
    await this.exitMenuMode(false);
    vscode.window.setStatusBarMessage("Autocorrect: staged block cleared", 3000);
  }

  private async startKeyboardCapture(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
      return;
    }
    this.staged.resetAttributes();
    if (!this.blockCapture.startKeyboardCapture(editor)) {
      return;
    }
    await setModeContext(MENU_MODE, false);
    await setModeContext(STAGED_MODE, false);
    await setModeContext(CAPTURE_ADJUST_MODE, true);
    vscode.window.setStatusBarMessage(CAPTURE_HINT, 15_000);
  }

  async menuPick(key: string | undefined): Promise<void> {
    if (!key) {
      return;
    }
    const k = key.toLowerCase();
    if (k === "s") {
      await this.startKeyboardCapture();
      return;
    }
    if (k === "q") {
      await this.menuReviewQueue();
      return;
    }
    if (k === "a") {
      await this.menuInstantBlock();
      return;
    }
    if (k === "c") {
      await this.menuInstantLine();
    }
  }

  captureMove(dir: "up" | "down" | "lineStart" | "lineEnd"): void {
    this.blockCapture.moveCaptureHead(dir);
  }

  async captureFinish(): Promise<void> {
    if (!this.blockCapture.finishKeyboardCapture()) {
      vscode.window.setStatusBarMessage("Autocorrect: no capture to finish", 3000);
      return;
    }
    await this.exitCaptureAdjustMode();
    await this.enterStagedMode(true);
  }

  async captureCancel(): Promise<void> {
    this.blockCapture.cancelCapture();
    this.staged.resetAttributes();
    await this.exitCaptureAdjustMode();
    await setModeContext(MENU_MODE, false);
    await setModeContext(STAGED_MODE, false);
  }

  dispose(): void {
    void setModeContext(MENU_MODE, false);
    void setModeContext(CAPTURE_ADJUST_MODE, false);
    void setModeContext(STAGED_MODE, false);
  }
}
