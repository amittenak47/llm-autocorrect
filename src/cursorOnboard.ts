import * as vscode from "vscode";

const STATE_KEY = "autocorrect.cursorDiagPromptShown";

function isCursorApp(): boolean {
  const name = (vscode.env.appName ?? "").toLowerCase();
  return name.includes("cursor");
}

/**
 * One-time Cursor prompt: Anysphere diagnostics often never fire, so Enter
 * autocorrect with line.requireDiagnostic=true silently does nothing.
 */
export async function maybeOfferCursorDiagnosticDefaults(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): Promise<void> {
  if (!isCursorApp()) {
    return;
  }
  if (context.globalState.get<boolean>(STATE_KEY)) {
    return;
  }
  const inspected = vscode.workspace
    .getConfiguration("autocorrect")
    .inspect<boolean>("line.requireDiagnostic");
  // Only prompt when still on package default (true) with no user/workspace override.
  if (inspected?.globalValue !== undefined || inspected?.workspaceValue !== undefined) {
    await context.globalState.update(STATE_KEY, true);
    return;
  }
  if (inspected?.defaultValue === false) {
    await context.globalState.update(STATE_KEY, true);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    "Autocorrect on Cursor: Enter fixes often need line.requireDiagnostic off because Anysphere Python diagnostics are quiet. Apply Cursor-friendly defaults?",
    "Use Cursor defaults",
    "Keep requiring LSP"
  );
  await context.globalState.update(STATE_KEY, true);
  if (choice === "Use Cursor defaults") {
    await vscode.workspace
      .getConfiguration("autocorrect")
      .update("line.requireDiagnostic", false, vscode.ConfigurationTarget.Global);
    output.appendLine(
      "[onboard] Cursor: set autocorrect.line.requireDiagnostic=false (global)"
    );
    vscode.window.setStatusBarMessage(
      "Autocorrect: Cursor defaults applied (Enter works without LSP squiggle)",
      6000
    );
  } else {
    output.appendLine("[onboard] Cursor: kept line.requireDiagnostic (user declined)");
  }
}
