import * as vscode from "vscode";
import { DEFAULT_PROFILES } from "./profiles";

const STATE_KEY = "autocorrect.defaultProfilesSeeded";

/**
 * One-time: write built-in profiles into User settings when the user has not
 * configured profiles (neither User nor Workspace). Prefer User over Workspace —
 * LLM keys and endpoints are personal, not project-specific.
 */
export async function maybeSeedDefaultProfiles(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): Promise<void> {
  if (context.globalState.get<boolean>(STATE_KEY)) {
    return;
  }

  const inspected = vscode.workspace
    .getConfiguration("autocorrect")
    .inspect<unknown[]>("profiles");

  const hasUser = Array.isArray(inspected?.globalValue) && inspected!.globalValue!.length > 0;
  const hasWorkspace =
    Array.isArray(inspected?.workspaceValue) && inspected!.workspaceValue!.length > 0;
  const hasFolder =
    Array.isArray(inspected?.workspaceFolderValue) &&
    inspected!.workspaceFolderValue!.length > 0;

  if (hasUser || hasWorkspace || hasFolder) {
    await context.globalState.update(STATE_KEY, true);
    return;
  }

  // Empty explicit [] in User/Workspace still counts as "configured" — leave it.
  if (
    inspected?.globalValue !== undefined ||
    inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined
  ) {
    await context.globalState.update(STATE_KEY, true);
    return;
  }

  await vscode.workspace.getConfiguration("autocorrect").update(
    "profiles",
    DEFAULT_PROFILES.map((p) => ({ ...p })),
    vscode.ConfigurationTarget.Global
  );

  const active = vscode.workspace.getConfiguration("autocorrect").inspect<string>("activeProfile");
  if (active?.globalValue === undefined && active?.workspaceValue === undefined) {
    await vscode.workspace
      .getConfiguration("autocorrect")
      .update("activeProfile", "groq", vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update(STATE_KEY, true);
  output.appendLine(
    `[onboard] seeded User settings with ${DEFAULT_PROFILES.length} default profiles (groq, gemini, anthropic, local, ollama)`
  );
}
