import * as vscode from "vscode";

interface MenuItem extends vscode.QuickPickItem {
  command: string;
}

/** Slash-style command picker — filterable menu, no text injected into the buffer. */
const ITEMS: MenuItem[] = [
  { label: "/block", description: "Correct selected block", command: "autocorrect.correctBlock" },
  { label: "/capture", description: "Start block capture (type, then /capture-end)", command: "autocorrect.startBlockCapture" },
  { label: "/capture-end", description: "End capture and correct", command: "autocorrect.endBlockCapture" },
  { label: "/capture-cancel", description: "Cancel block capture", command: "autocorrect.cancelBlockCapture" },
  { label: "/doc", description: "Docstrings & comments", command: "autocorrect.documentBlock" },
  { label: "/caveman", description: "Ultra-short inline comments", command: "autocorrect.cavemanComment" },
  { label: "/line", description: "Correct selected line", command: "autocorrect.correctSelection" },
  { label: "/translate", description: "Translate selection to file language", command: "autocorrect.translateSelection" },
  { label: "/queue", description: "Review queued fixes", command: "autocorrect.reviewQueuedFixes" },
  { label: "/queue-apply", description: "Apply all queued fixes", command: "autocorrect.applyQueuedFixes" },
  { label: "/queue-clear", description: "Clear queued fixes", command: "autocorrect.clearQueuedFixes" },
  { label: "/queue-toggle", description: "Toggle queued fix mode", command: "autocorrect.toggleQueueMode" },
];

export async function showCommandMenu(): Promise<void> {
  const pick = await vscode.window.showQuickPick(ITEMS, {
    title: "Autocorrect",
    placeHolder: "Type to filter — e.g. /block, /caveman, /queue",
  });
  if (pick) {
    await vscode.commands.executeCommand(pick.command);
  }
}
