import * as vscode from "vscode";
import { cfg, setEnabled } from "./config";
import { LineCorrector } from "./lineCorrector";
import { LlmClient, secretKeyFor } from "./llm";
import { PasteTranslator } from "./pasteTranslator";
import { StatusBar } from "./statusBar";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("AI Autocorrect");
  const statusBar = new StatusBar();
  const llm = new LlmClient(context.secrets);
  const lineCorrector = new LineCorrector(llm, statusBar, output);
  const pasteTranslator = new PasteTranslator(llm, statusBar, output);

  context.subscriptions.push(
    output,
    statusBar,
    lineCorrector,
    pasteTranslator,

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
    )
  );
}

export function deactivate(): void {}
