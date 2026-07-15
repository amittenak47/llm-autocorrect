import * as vscode from "vscode";

export const MENU_MODE = "autocorrect.menuMode";
export const CAPTURE_ADJUST_MODE = "autocorrect.captureAdjustMode";

export async function setModeContext(key: string, value: boolean): Promise<void> {
  await vscode.commands.executeCommand("setContext", key, value);
}

export async function clearAllModes(): Promise<void> {
  await setModeContext(MENU_MODE, false);
  await setModeContext(CAPTURE_ADJUST_MODE, false);
}
