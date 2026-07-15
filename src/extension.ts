import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { blockLineRange } from "./blockApply";
import { showCommandMenu } from "./commandMenu";
import { cfg, setEnabled, setQueueEnabled } from "./config";
import { Commenter } from "./commenter";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LineCorrector } from "./lineCorrector";
import { LlmClient, secretKeyFor } from "./llm";
import { clearAllModes } from "./modeContext";
import { ModeController } from "./modeController";
import { PasteTranslator } from "./pasteTranslator";
import { StagedExecutor } from "./stagedExecutor";
import { StatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("LLM Autocorrect");
  const statusBar = new StatusBar();
  const flash = new Flash();
  const llm = new LlmClient(context.secrets);
  const fixQueue = new FixQueue(statusBar, output);
  const lineCorrector = new LineCorrector(llm, statusBar, fixQueue, output);
  const pasteTranslator = new PasteTranslator(llm, statusBar, output);
  const blockCapture = new BlockCapture(output);
  const stagedExecutor = new StagedExecutor(llm, fixQueue, statusBar, flash, output);
  const commenter = new Commenter(stagedExecutor, blockCapture);
  const modeController = new ModeController(
    blockCapture,
    stagedExecutor,
    lineCorrector,
    fixQueue,
    output
  );

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
        vscode.window.setStatusBarMessage(`Autocorrect: cleared API key for ${provider}`, 3000);
      } else {
        await context.secrets.store(secretKeyFor(provider), key);
        vscode.window.setStatusBarMessage(`Autocorrect: API key saved for ${provider}`, 3000);
      }
    }),

    vscode.commands.registerCommand("autocorrect.translateSelection", () =>
      pasteTranslator.translateSelection()
    ),

    vscode.commands.registerCommand("autocorrect.correctSelection", () =>
      lineCorrector.correctLineNearCursor(false)
    ),

    vscode.commands.registerCommand("autocorrect.showMenu", () => showCommandMenu()),

    vscode.commands.registerCommand("autocorrect.enterMenuMode", () =>
      modeController.enterMenuMode()
    ),
    vscode.commands.registerCommand("autocorrect.exitMenuMode", () =>
      modeController.exitMenuMode(true)
    ),

    vscode.commands.registerCommand("autocorrect.menuKeyA", () => modeController.menuPick("a")),
    vscode.commands.registerCommand("autocorrect.menuKeyShiftA", () =>
      modeController.menuStageBlock()
    ),
    vscode.commands.registerCommand("autocorrect.menuKeyS", () => modeController.menuPick("s")),
    vscode.commands.registerCommand("autocorrect.menuKeyQ", () => modeController.menuPick("q")),
    vscode.commands.registerCommand("autocorrect.menuKeyC", () => modeController.menuPick("c")),
    vscode.commands.registerCommand("autocorrect.menuKeyShiftC", () =>
      modeController.menuStageLine()
    ),

    vscode.commands.registerCommand("autocorrect.stagedSetDocs", () =>
      modeController.stagedSetDocs()
    ),
    vscode.commands.registerCommand("autocorrect.stagedSetCaveman", () =>
      modeController.stagedSetCaveman()
    ),
    vscode.commands.registerCommand("autocorrect.stagedSetContext", () =>
      modeController.stagedSetContext()
    ),
    vscode.commands.registerCommand("autocorrect.stagedSubmit", () =>
      modeController.stagedSubmit(false)
    ),
    vscode.commands.registerCommand("autocorrect.stagedSubmitQueue", () =>
      modeController.stagedSubmit(true)
    ),
    vscode.commands.registerCommand("autocorrect.stagedCancel", () =>
      modeController.stagedCancel()
    ),

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
    vscode.commands.registerCommand("autocorrect.captureFinish", () =>
      modeController.captureFinish()
    ),
    vscode.commands.registerCommand("autocorrect.captureCancel", () =>
      modeController.captureCancel()
    ),

    vscode.commands.registerCommand("autocorrect.correctBlock", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
        return;
      }
      const staged = blockCapture.getStagedRange(editor);
      const range =
        staged ??
        (editor.selection.isEmpty
          ? undefined
          : blockLineRange(editor.document, editor.selection.start.line, editor.selection.end.line));
      if (!range) {
        vscode.window.setStatusBarMessage("Autocorrect: select a block first", 3000);
        return;
      }
      const result = await stagedExecutor.run(
        editor,
        range,
        { op: "fix", contextNote: "" },
        false
      );
      if (result.ok) {
        blockCapture.clearStaged();
      }
    }),
    vscode.commands.registerCommand("autocorrect.documentBlock", () =>
      commenter.documentBlock(false)
    ),
    vscode.commands.registerCommand("autocorrect.cavemanComment", () =>
      commenter.cavemanComment(false)
    ),

    vscode.commands.registerCommand("autocorrect.reviewQueuedFixes", () => fixQueue.review()),
    vscode.commands.registerCommand("autocorrect.applyQueuedFixes", () => fixQueue.applyAll()),
    vscode.commands.registerCommand("autocorrect.clearQueuedFixes", () => fixQueue.clear()),
    vscode.commands.registerCommand("autocorrect.toggleQueueMode", async () => {
      const next = !cfg().queueEnabled;
      await setQueueEnabled(next);
      vscode.window.setStatusBarMessage(
        next
          ? "Autocorrect: Enter-fixes queue ON"
          : "Autocorrect: Enter-fixes queue OFF",
        4000
      );
    })
  );
}

export function deactivate(): void {}
