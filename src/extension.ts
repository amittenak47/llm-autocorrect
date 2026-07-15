import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { Commenter } from "./commenter";
import { showCommandMenu } from "./commandMenu";
import { cfg, setEnabled, setQueueEnabled } from "./config";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LineCorrector } from "./lineCorrector";
import { LlmClient, secretKeyFor } from "./llm";
import { clearAllModes } from "./modeContext";
import { ModeController } from "./modeController";
import { PasteTranslator } from "./pasteTranslator";
import { StatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("LLM Autocorrect");
  const statusBar = new StatusBar();
  const flash = new Flash();
  const llm = new LlmClient(context.secrets);
  const fixQueue = new FixQueue(statusBar, output);
  const lineCorrector = new LineCorrector(llm, statusBar, fixQueue, output);
  const pasteTranslator = new PasteTranslator(llm, statusBar, output);
  const blockCapture = new BlockCapture(llm, statusBar, flash, output);
  const commenter = new Commenter(llm, blockCapture, statusBar, flash, output);
  const modeController = new ModeController(blockCapture, output);

  await clearAllModes();
  output.appendLine("[mode] extension activated");

  context.subscriptions.push(
    output,
    statusBar,
    flash,
    fixQueue,
    lineCorrector,
    pasteTranslator,
    blockCapture,
    modeController,

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("autocorrect")) {
        statusBar.refresh();
      }
    }),

    vscode.commands.registerCommand("autocorrect.toggle", async () => {
      await setEnabled(!cfg().enabled);
      statusBar.refresh();
    }),

    vscode.commands.registerCommand("autocorrect.setApiKey", async () => {
      const provider = await vscode.window.showQuickPick(
        ["groq", "gemini", "anthropic", "openai-compatible"],
        { placeHolder: "Provider to set the API key for", title: "Autocorrect: Set API Key" }
      );
      if (!provider) {
        return;
      }
      const key = await vscode.window.showInputBox({
        prompt: `API key for ${provider} (stored in VS Code secret storage)`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) {
        return;
      }
      if (key === "") {
        await context.secrets.delete(secretKeyFor(provider));
        void vscode.window.showInformationMessage(`Autocorrect: cleared API key for ${provider}.`);
      } else {
        await context.secrets.store(secretKeyFor(provider), key);
        void vscode.window.showInformationMessage(`Autocorrect: API key for ${provider} saved.`);
      }
    }),

    vscode.commands.registerCommand("autocorrect.translateSelection", () =>
      pasteTranslator.translateSelection()
    ),

    vscode.commands.registerCommand("autocorrect.correctSelection", () =>
      lineCorrector.correctSelection()
    ),

    vscode.commands.registerCommand("autocorrect.showMenu", () => showCommandMenu()),

    vscode.commands.registerCommand("autocorrect.enterMenuMode", () =>
      modeController.enterMenuMode()
    ),
    vscode.commands.registerCommand("autocorrect.exitMenuMode", () =>
      modeController.exitMenuMode()
    ),

    // Dedicated commands — keybinding args are unreliable across hosts.
    vscode.commands.registerCommand("autocorrect.menuKeyA", () => modeController.menuPick("a")),
    vscode.commands.registerCommand("autocorrect.menuKeyS", () => modeController.menuPick("s")),
    vscode.commands.registerCommand("autocorrect.menuKeyD", () => modeController.menuPick("d")),
    vscode.commands.registerCommand("autocorrect.menuKeyF", () => modeController.menuPick("f")),
    vscode.commands.registerCommand("autocorrect.menuKeyQ", () => modeController.menuPick("q")),
    vscode.commands.registerCommand("autocorrect.menuKeyL", () => modeController.menuPick("l")),

    vscode.commands.registerCommand("autocorrect.captureMoveUp", () =>
      modeController.captureMove("up")
    ),
    vscode.commands.registerCommand("autocorrect.captureMoveDown", () =>
      modeController.captureMove("down")
    ),
    vscode.commands.registerCommand("autocorrect.captureMoveLineStart", () =>
      modeController.captureMove("lineStart")
    ),
    vscode.commands.registerCommand("autocorrect.captureMoveLineEnd", () =>
      modeController.captureMove("lineEnd")
    ),
    vscode.commands.registerCommand("autocorrect.captureEnd", () => modeController.captureEnd()),
    vscode.commands.registerCommand("autocorrect.captureCancel", () =>
      modeController.captureCancel()
    ),

    vscode.commands.registerCommand("autocorrect.correctBlock", () =>
      blockCapture.correctBlock()
    ),
    vscode.commands.registerCommand("autocorrect.startBlockCapture", () =>
      blockCapture.startCapture()
    ),
    vscode.commands.registerCommand("autocorrect.endBlockCapture", async () => {
      await blockCapture.endCapture();
      await modeController.exitCaptureAdjustMode();
    }),
    vscode.commands.registerCommand("autocorrect.cancelBlockCapture", () => {
      blockCapture.cancelCapture();
      void modeController.exitCaptureAdjustMode();
    }),

    vscode.commands.registerCommand("autocorrect.documentBlock", () =>
      commenter.documentBlock()
    ),
    vscode.commands.registerCommand("autocorrect.cavemanComment", () =>
      commenter.cavemanComment()
    ),

    vscode.commands.registerCommand("autocorrect.reviewQueuedFixes", () =>
      fixQueue.review()
    ),
    vscode.commands.registerCommand("autocorrect.applyQueuedFixes", () =>
      fixQueue.applyAll()
    ),
    vscode.commands.registerCommand("autocorrect.clearQueuedFixes", () =>
      fixQueue.clear()
    ),
    vscode.commands.registerCommand("autocorrect.toggleQueueMode", async () => {
      const next = !cfg().queueEnabled;
      await setQueueEnabled(next);
      vscode.window.setStatusBarMessage(
        next
          ? "Autocorrect: queued mode ON — Enter fixes are staged for review"
          : "Autocorrect: queued mode OFF — fixes apply immediately",
        4000
      );
    })
  );
}

export function deactivate(): void {}
