import * as vscode from "vscode";

interface MenuItem extends vscode.QuickPickItem {
  command: string;
}

const ITEMS: MenuItem[] = [
  { label: "/menu", description: "Enter modal menu mode", command: "autocorrect.enterMenuMode" },
  { label: "/block", description: "Correct selected / staged block", command: "autocorrect.correctBlock" },
  { label: "/line", description: "Correct line near cursor", command: "autocorrect.correctSelection" },
  { label: "/doc", description: "Docstrings & comments", command: "autocorrect.documentBlock" },
  { label: "/caveman", description: "Ultra-short inline comments", command: "autocorrect.cavemanComment" },
  { label: "/context", description: "Set block context for next send", command: "autocorrect.captureSetContext" },
  { label: "/queue", description: "Review queued fixes", command: "autocorrect.reviewQueuedFixes" },
  { label: "/translate", description: "Translate selection", command: "autocorrect.translateSelection" },
];

export async function showCommandMenu(): Promise<void> {
  const pick = await vscode.window.showQuickPick(ITEMS, {
    title: "Autocorrect",
    placeHolder: "Type to filter — prefer Ctrl+Shift+; for modal menu",
  });
  if (pick) {
    await vscode.commands.executeCommand(pick.command);
  }
}
