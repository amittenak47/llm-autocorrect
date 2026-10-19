import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { selectionLineSpan } from "./blockMath";
import { blockLineRange } from "./blockApply";
import { showCommandMenu } from "./commandMenu";
import { activeLlmProfile, cfg, invalidateConfigCache, setDisableAutocorrect, setEnabled, setQueueEnabled } from "./config";
import { ContextAssemblerService } from "./contextAssembler";
import { Commenter } from "./commenter";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LineCorrector } from "./lineCorrector";
import { endpointFingerprint, secretKeyBindingForProfile } from "./endpointFingerprint";
import { LlmClient, secretKeyForProfile } from "./llm";
import { LlmRouter } from "./llmRouter";
import { LogicReviewer } from "./logicReviewer";
import { ProfileConcurrency } from "./profileConcurrency";
import { clearAllModes } from "./modeContext";
import { ModeController } from "./modeController";
import { PasteTranslator } from "./pasteTranslator";
import { StageDecorations } from "./stageDecorations";
import { StagedExecutor } from "./stagedExecutor";
import { QueueExecutor } from "./queueExecutor";
import { StatusBar } from "./statusBar";
import { defaultWasmDir, SyntaxChecker } from "./syntaxCheck";
import { maybeOfferCursorDiagnosticDefaults } from "./cursorOnboard";
import { maybeMigrateSeededProfiles } from "./profilesMigrate";
import { pickAndRunTypingHarness } from "./typingHarness";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("LLM Autocorrect");
  const statusBar = new StatusBar();
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("autocorrect")) {
      invalidateConfigCache();
      statusBar.refresh();
      stageDeco.refresh();
    }
  }));
  const flash = new Flash();
  const llm = new LlmClient(context.secrets);
  llm.setOutput(output);
  const profileConcurrency = new ProfileConcurrency();
  const router = new LlmRouter(llm, profileConcurrency);
  router.setOutput(output);
  const contextAsm = new ContextAssemblerService(output);
  const stageDeco = new StageDecorations();
  const fixQueue = new FixQueue(statusBar, output);
  const syntaxChecker = new SyntaxChecker(defaultWasmDir());
  const lineCorrector = new LineCorrector(router, contextAsm, statusBar, fixQueue, output, syntaxChecker);
  const pasteTranslator = new PasteTranslator(router, statusBar, output);
  const blockCapture = new BlockCapture(output);
  const logicReviewer = new LogicReviewer(router, blockCapture, statusBar, output);
  const stagedExecutor = new StagedExecutor(
    router,
    contextAsm,
    fixQueue,
    statusBar,
    flash,
    output,
    syntaxChecker
  );
  const queueExecutor = new QueueExecutor(stagedExecutor, lineCorrector);
  fixQueue.setExecutor(queueExecutor);
  const commenter = new Commenter(stagedExecutor, blockCapture);
    const modeController = new ModeController(
    blockCapture,
    stagedExecutor,
    lineCorrector,
    fixQueue,
    router,
    contextAsm,
    stageDeco,
    statusBar,
    output
  );

  await clearAllModes();
  output.appendLine(
    `[mode] extension activated v${context.extension.packageJSON.version}` +
      ` · profile=${cfg().activeProfile}` +
      ` · [${cfg().profiles.map((p) => p.id).join(", ")}]`
  );
  await maybeMigrateSeededProfiles(context, output);
  void maybeOfferCursorDiagnosticDefaults(context, output);

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
    logicReviewer,
    modeController,

    vscode.commands.registerCommand("autocorrect.statusBarClick", async () => {
      if (statusBar.isInMode()) {
        await showCommandMenu();
        return;
      }
      await setEnabled(!cfg().enabled);
      statusBar.refresh();
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
      const secretKey = secretKeyForProfile(pick.profile.id);
      if (key === "") {
        await context.secrets.delete(secretKey);
        await context.secrets.delete(secretKeyBindingForProfile(pick.profile.id));
        vscode.window.setStatusBarMessage(`Autocorrect: cleared key for ${pick.profile.label}`, 3000);
      } else {
        await context.secrets.store(secretKey, key);
        await context.secrets.store(secretKeyBindingForProfile(pick.profile.id), endpointFingerprint(pick.profile));
        vscode.window.setStatusBarMessage(`Autocorrect: key saved for ${pick.profile.label}`, 3000);
      }
    }),

    vscode.commands.registerCommand("autocorrect.translateSelection", () =>
      pasteTranslator.translateSelection()
    ),

    vscode.commands.registerCommand("autocorrect.correctSelection", () =>
      lineCorrector.correctLineNearCursor(false)
    ),

    vscode.commands.registerCommand("autocorrect.reviewLogic", () => logicReviewer.run()),
    vscode.commands.registerCommand("autocorrect.clearLogicSuggestions", () => logicReviewer.clear()),

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

    vscode.commands.registerCommand("autocorrect.restageQueuedAtCursor", () =>
      modeController.restageQueuedAtCursor()
    ),
    vscode.commands.registerCommand("autocorrect.stagedResize", () =>
      modeController.stagedResize()
    ),
    vscode.commands.registerCommand("autocorrect.stagedThenDocs", () =>
      modeController.stagedToggleThen("docs")
    ),
    vscode.commands.registerCommand("autocorrect.stagedThenCaveman", () =>
      modeController.stagedToggleThen("caveman")
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
      const selection = editor.selection;
      const span = selectionLineSpan(selection.start.line, selection.end.line, selection.end.character);
      const range =
        staged ??
        (editor.selection.isEmpty
          ? undefined
          : blockLineRange(editor.document, span.startLine, span.endLine));
      if (!range) {
        vscode.window.setStatusBarMessage("Autocorrect: select a block first", 3000);
        return;
      }
      const result = await stagedExecutor.run(
        editor,
        range,
        {
          op: "fix",
          then: [],
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
    vscode.commands.registerCommand("autocorrect.removeQueuedAtCursor", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.setStatusBarMessage("Autocorrect: open a file first", 3000);
        return;
      }
      await fixQueue.removeAtCursor(editor);
    }),
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
    }),

    vscode.commands.registerCommand("autocorrect.runTypingHarness", async () => {
      try {
        await pickAndRunTypingHarness(output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`[harness] ${msg}`);
        void vscode.window.showErrorMessage(`Autocorrect harness: ${msg}`);
      }
    })
  );
}

export function deactivate(): void {}
