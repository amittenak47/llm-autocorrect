import * as vscode from "vscode";
import { BlockCapture } from "./blockCapture";
import { Commenter } from "./commenter";
import { cfg, setEnabled, setQueueEnabled } from "./config";
import { FixQueue } from "./fixQueue";
import { Flash } from "./flash";
import { LineCorrector } from "./lineCorrector";
import { LlmClient, secretKeyFor } from "./llm";
import { PasteTranslator } from "./pasteTranslator";
import { StatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("LLM Autocorrect");
  const statusBar = new StatusBar();
  const flash = new Flash();
  const llm = new LlmClient(context.secrets);
  const fixQueue = new FixQueue(statusBar, output);
  const lineCorrector = new LineCorrector(llm, statusBar, fixQueue, output);
  const pasteTranslator = new PasteTranslator(llm, statusBar, output);
  const blockCapture = new BlockCapture(llm, statusBar, flash, output);
  const commenter = new Commenter(llm, blockCapture, statusBar, flash, output);

  context.subscriptions.push(
    output,
    statusBar,
    flash,
    fixQueue,
    lineCorrector,
    pasteTranslator,
    blockCapture,

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

    // Block capture (reverse: selection is the block; advance: start/end recording).
    vscode.commands.registerCommand("autocorrect.correctBlock", () =>
      blockCapture.correctBlock()
    ),
    vscode.commands.registerCommand("autocorrect.startBlockCapture", () =>
      blockCapture.startCapture()
    ),
    vscode.commands.registerCommand("autocorrect.endBlockCapture", () =>
      blockCapture.endCapture()
    ),
    vscode.commands.registerCommand("autocorrect.cancelBlockCapture", () =>
      blockCapture.cancelCapture()
    ),

    // Documentation / comments on demand.
    vscode.commands.registerCommand("autocorrect.documentBlock", () =>
      commenter.documentBlock()
    ),
    vscode.commands.registerCommand("autocorrect.cavemanComment", () =>
      commenter.cavemanComment()
    ),

    // Queued execution: review/apply/clear staged line fixes.
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
