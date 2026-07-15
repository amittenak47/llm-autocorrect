import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { CAPTURE_ADJUST_MODE, MENU_MODE, setModeContext } from "./modeContext";

const MENU_HINT =
  "Autocorrect menu — A block · S capture (WASD) · D doc · F caveman · Q queue · Esc exit";
const CAPTURE_HINT = "Capture block — W/S up/down · A/D line ends · E send · Esc cancel";

/**
 * Vim-style modal UX: double-Ctrl opens a one-key menu; S enters WASD block capture.
 * Keys are bound in package.json with when-clauses on context flags set here.
 */
export class ModeController implements vscode.Disposable {
  constructor(
    private readonly blockCapture: BlockCapture,
    private readonly output: vscode.OutputChannel
  ) {}

  async enterMenuMode(): Promise<void> {
    if (this.blockCapture.isKeyboardCapture()) {
      return;
    }
    await setModeContext(MENU_MODE, true);
    await setModeContext(CAPTURE_ADJUST_MODE, false);
    vscode.window.setStatusBarMessage(MENU_HINT, 10_000);
    this.output.appendLine("[mode] menu mode ON — press A/S/D/F or Esc");
  }

  async exitMenuMode(): Promise<void> {
    await setModeContext(MENU_MODE, false);
  }

  async exitCaptureAdjustMode(): Promise<void> {
    await setModeContext(CAPTURE_ADJUST_MODE, false);
  }

  async menuPick(key: string | undefined): Promise<void> {
    if (!key || typeof key !== "string") {
      return;
    }
    const k = key.toLowerCase();
    if (k === "s") {
      await this.startKeyboardCapture();
      return;
    }
    await this.exitMenuMode();
    switch (k) {
      case "a":
        await vscode.commands.executeCommand("autocorrect.correctBlock");
        break;
      case "d":
        await vscode.commands.executeCommand("autocorrect.documentBlock");
        break;
      case "f":
        await vscode.commands.executeCommand("autocorrect.cavemanComment");
        break;
      case "q":
        await vscode.commands.executeCommand("autocorrect.reviewQueuedFixes");
        break;
      case "l":
        await vscode.commands.executeCommand("autocorrect.correctSelection");
        break;
      case "t":
        await vscode.commands.executeCommand("autocorrect.translateSelection");
        break;
      default:
        vscode.window.setStatusBarMessage(`Autocorrect: unknown menu key "${key}"`, 3000);
    }
  }

  private async startKeyboardCapture(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      await this.exitMenuMode();
      void vscode.window.showInformationMessage("Autocorrect: open a file first.");
      return;
    }
    if (!this.blockCapture.startKeyboardCapture(editor)) {
      await this.exitMenuMode();
      return;
    }
    await setModeContext(MENU_MODE, false);
    await setModeContext(CAPTURE_ADJUST_MODE, true);
    vscode.window.setStatusBarMessage(CAPTURE_HINT, 15_000);
  }

  captureMove(dir: "up" | "down" | "lineStart" | "lineEnd"): void {
    this.blockCapture.moveCaptureHead(dir);
  }

  async captureEnd(): Promise<void> {
    await this.blockCapture.endCapture();
    await this.exitCaptureAdjustMode();
  }

  async captureCancel(): Promise<void> {
    this.blockCapture.cancelCapture();
    await this.exitCaptureAdjustMode();
  }

  dispose(): void {
    void setModeContext(MENU_MODE, false);
    void setModeContext(CAPTURE_ADJUST_MODE, false);
  }
}
