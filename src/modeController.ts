import * as vscode from "vscode";
import { activeLlmProfile, cfg, setActiveProfile } from "./config";
import { ContextAssemblerService } from "./contextAssembler";
import { BlockCapture } from "./blockCapture";
import { FixQueue } from "./fixQueue";
import { LlmRouter } from "./llmRouter";
import { LineCorrector } from "./lineCorrector";
import {
  CAPTURE_ADJUST_MODE,
  MENU_MODE,
  STAGED_MODE,
  setModeContext,
} from "./modeContext";
import { StageDecorations } from "./stageDecorations";
import { StagedExecutor } from "./stagedExecutor";
import { StagedSession } from "./stagedSession";

const MENU_HINT =
  "Menu — A/C instant · Shift+A/C stage · S capture · Q review · Shift+Q all queues · Esc";
const CAPTURE_HINT = "Capture — WASD size · E finish · Esc cancel";
const STAGED_HINT =
  "Staged — D/F/X op · 1-5 ctx · M profile · E send · Shift+E queue · Esc";

export class ModeController implements vscode.Disposable {
  readonly staged = new StagedSession();

  constructor(
    private readonly blockCapture: BlockCapture,
    private readonly stagedExecutor: StagedExecutor,
    private readonly lineCorrector: LineCorrector,
    private readonly fixQueue: FixQueue,
    private readonly router: LlmRouter,
    private readonly contextAsm: ContextAssemblerService,
    private readonly stageDeco: StageDecorations,
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
    const profileId = activeLlmProfile().id;
    if (resetAttrs) {
      this.staged.resetAttributes(profileId, cfg().defaultTiers);
    } else {
      this.staged.attributes.profileId = profileId;
    }
    this.syncStageDecorations();
    this.refreshStagedHint();
  }

  async exitMenuMode(clearStaged = false): Promise<void> {
    await setModeContext(MENU_MODE, false);
    await setModeContext(STAGED_MODE, false);
    if (clearStaged) {
      this.blockCapture.clearStaged();
      this.staged.resetAttributes(activeLlmProfile().id);
      this.stageDeco.clear();
    }
  }

  async exitCaptureAdjustMode(): Promise<void> {
    await setModeContext(CAPTURE_ADJUST_MODE, false);
  }

  private syncStageDecorations(): void {
    const editor = vscode.window.activeTextEditor;
    const range = editor ? this.blockCapture.getStagedRange(editor) : undefined;
    this.stageDeco.setStaged(editor, range, this.staged.attributes);
  }

  private refreshStagedHint(): void {
    const editor = vscode.window.activeTextEditor;
    const prof = this.router.profileById(this.staged.attributes.profileId) ?? this.router.activeProfile;
    let tok: number | undefined;
    if (editor) {
      const range = this.blockCapture.getStagedRange(editor);
      if (range) {
        tok = this.contextAsm.estimateForBlock(editor, range, this.staged.attributes.tiers, prof);
      }
    }
    vscode.window.setStatusBarMessage(
      `${STAGED_HINT} [${this.staged.flagsLabel(prof.label, tok)}]`,
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
    const attrs = { ...this.staged.attributes, op: "fix" as const, profileId: activeLlmProfile().id };
    const result = await this.stagedExecutor.run(editor, range, attrs, false);
    if (result.ok) {
      this.blockCapture.clearStaged();
      this.staged.resetAttributes(activeLlmProfile().id);
      this.stageDeco.clear();
      await this.exitMenuMode(false);
    }
  }

  async menuInstantLine(): Promise<void> {
    await this.lineCorrector.correctLineNearCursor(false);
    this.blockCapture.clearStaged();
    this.staged.resetAttributes(activeLlmProfile().id);
    this.stageDeco.clear();
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

  async menuReviewQueue(allProfiles = false): Promise<void> {
    await this.exitMenuMode(false);
    if (allProfiles) {
      await this.fixQueue.reviewAllProfiles();
    } else {
      await this.fixQueue.reviewActiveProfile();
    }
  }

  async stagedSetDocs(): Promise<void> {
    this.staged.setDocs();
    this.syncStageDecorations();
    this.refreshStagedHint();
  }

  async stagedSetCaveman(): Promise<void> {
    this.staged.setCaveman();
    this.syncStageDecorations();
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

  stagedToggleTier(n: 1 | 2 | 3 | 4 | 5): void {
    this.staged.toggleTier(n);
    this.syncStageDecorations();
    this.refreshStagedHint();
  }

  async stagedCycleProfile(): Promise<void> {
    const next = this.router.cycleProfile(1);
    await setActiveProfile(next.id);
    this.staged.setProfileId(next.id);
    this.syncStageDecorations();
    this.refreshStagedHint();
    vscode.window.setStatusBarMessage(`Autocorrect: profile → ${next.label}`, 3000);
  }

  async stagedPickProfile(): Promise<void> {
    const profiles = this.router.listProfiles();
    const pick = await vscode.window.showQuickPick(
      profiles.map((p) => ({ label: p.label, description: p.id, profile: p })),
      { title: "Autocorrect: LLM profile", placeHolder: "Profile for next send" }
    );
    if (!pick) {
      return;
    }
    await setActiveProfile(pick.profile.id);
    this.staged.setProfileId(pick.profile.id);
    this.syncStageDecorations();
    this.refreshStagedHint();
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
      this.staged.resetAttributes(activeLlmProfile().id);
      this.stageDeco.clear();
      await this.exitMenuMode(false);
    }
  }

  async stagedCancel(): Promise<void> {
    this.blockCapture.clearStaged();
    this.staged.resetAttributes(activeLlmProfile().id);
    this.stageDeco.clear();
    await this.exitMenuMode(false);
    vscode.window.setStatusBarMessage("Autocorrect: staged block cleared", 3000);
  }

  private async startKeyboardCapture(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
      return;
    }
    this.staged.resetAttributes(activeLlmProfile().id);
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
      await this.menuReviewQueue(false);
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
    this.staged.resetAttributes(activeLlmProfile().id);
    this.stageDeco.clear();
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
