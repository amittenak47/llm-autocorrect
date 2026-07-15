import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { blockLineRange } from "./blockApply";
import { showCommandMenu } from "./commandMenu";
import { activeLlmProfile, cfg, setDisableAutocorrect, setEnabled, setQueueEnabled } from "./config";
import { ContextAssemblerService } from "./contextAssembler";
import { Commenter } from "./commenter";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LineCorrector } from "./lineCorrector";
import { LlmClient, secretKeyForProfile } from "./llm";
import { LlmRouter } from "./llmRouter";
import { clearAllModes } from "./modeContext";
import { ModeController } from "./modeController";
import { PasteTranslator } from "./pasteTranslator";
import { StageDecorations } from "./stageDecorations";
import { StagedExecutor } from "./stagedExecutor";
import { StatusBar } from "./statusBar";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("LLM Autocorrect");
  const statusBar = new StatusBar();
  const flash = new Flash();
  const llm = new LlmClient(context.secrets);
  const router = new LlmRouter(llm);
  const contextAsm = new ContextAssemblerService();
  const stageDeco = new StageDecorations();
  const fixQueue = new FixQueue(statusBar, output);
  const lineCorrector = new LineCorrector(router, contextAsm, statusBar, fixQueue, output);
  const pasteTranslator = new PasteTranslator(router, statusBar, output);
  const blockCapture = new BlockCapture(output);
  const stagedExecutor = new StagedExecutor(
    router,
    contextAsm,
    fixQueue,
    statusBar,
    flash,
    output
  );
  const commenter = new Commenter(stagedExecutor, blockCapture);
  const modeController = new ModeController(
    blockCapture,
    stagedExecutor,
    lineCorrector,
    fixQueue,
    router,
    contextAsm,
    stageDeco,
    output
  );

  await clearAllModes();
  output.appendLine("[mode] extension activated");

  context.subscriptions.push(
    output,
    statusBar,
    flash,
    fixQueue,
    contextAsm,
    stageDeco,
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
      const profiles = cfg().profiles;
      const pick = await vscode.window.showQuickPick(
        profiles.map((p) => ({ label: p.label, description: p.provider, profile: p })),
        { placeHolder: "Profile to set API key for", title: "Autocorrect: Set API Key" }
      );
      if (!pick) {
        return;
      }
      const key = await vscode.window.showInputBox({
        prompt: `API key for ${pick.profile.label} (secret storage)`,
        password: true,
        ignoreFocusOut: true,
      });
      if (key === undefined) {
        return;
      }
      const secretKey = secretKeyForProfile(pick.profile.id, pick.profile.provider);
      if (key === "") {
        await context.secrets.delete(secretKey);
        vscode.window.setStatusBarMessage(`Autocorrect: cleared key for ${pick.profile.label}`, 3000);
      } else {
        await context.secrets.store(secretKey, key);
        vscode.window.setStatusBarMessage(`Autocorrect: key saved for ${pick.profile.label}`, 3000);
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
    vscode.commands.registerCommand("autocorrect.menuKeyShiftQ", () =>
      modeController.menuReviewQueue(true)
    ),
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
    vscode.commands.registerCommand("autocorrect.stagedToggleTier1", () =>
      modeController.stagedToggleTier(1)
    ),
    vscode.commands.registerCommand("autocorrect.stagedToggleTier2", () =>
      modeController.stagedToggleTier(2)
    ),
    vscode.commands.registerCommand("autocorrect.stagedToggleTier3", () =>
      modeController.stagedToggleTier(3)
    ),
    vscode.commands.registerCommand("autocorrect.stagedToggleTier4", () =>
      modeController.stagedToggleTier(4)
    ),
    vscode.commands.registerCommand("autocorrect.stagedToggleTier5", () =>
      modeController.stagedToggleTier(5)
    ),
    vscode.commands.registerCommand("autocorrect.stagedCycleProfile", () =>
      modeController.stagedCycleProfile()
    ),
    vscode.commands.registerCommand("autocorrect.stagedPickProfile", () =>
      modeController.stagedPickProfile()
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
        {
          op: "fix",
          contextNote: "",
          tiers: cfg().defaultTiers,
          profileId: activeLlmProfile().id,
        },
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

    vscode.commands.registerCommand("autocorrect.reviewQueuedFixes", () =>
      fixQueue.reviewAllProfiles()
    ),
    vscode.commands.registerCommand("autocorrect.applyQueuedFixes", () => fixQueue.applyAll()),
    vscode.commands.registerCommand("autocorrect.clearQueuedFixes", () => fixQueue.clear()),
    vscode.commands.registerCommand("autocorrect.toggleQueueMode", async () => {
      const next = !cfg().queueEnabled;
      await setQueueEnabled(next);
      statusBar.refresh();
      vscode.window.setStatusBarMessage(
        next
          ? "Autocorrect: review before apply ON"
          : "Autocorrect: review before apply OFF",
        4000
      );
    }),

    vscode.commands.registerCommand("autocorrect.toggleDisableAutocorrect", async () => {
      const next = !cfg().disableAutocorrect;
      await setDisableAutocorrect(next);
      statusBar.refresh();
      vscode.window.setStatusBarMessage(
        next
          ? "Autocorrect: Enter fixes OFF — fix on demand with C/A or staged keys"
          : "Autocorrect: Enter fixes ON",
        4000
      );
    })
  );
}

export function deactivate(): void {}
