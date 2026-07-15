import * as vscode from "vscode";
import { cfg } from "./config";

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private busyCount = 0;
  private queueCount = 0;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "autocorrect.toggle";
    this.item.show();
    this.refresh();
  }

  refresh(): void {
    const { enabled } = cfg();
    const queued = this.queueCount > 0 ? ` (${this.queueCount} queued)` : "";
    if (this.busyCount > 0) {
      this.item.text = `$(sync~spin) Autocorrect${queued}`;
      this.item.tooltip = "Autocorrect: checking…";
    } else if (enabled) {
      this.item.text = `$(sparkle) Autocorrect${queued}`;
      this.item.tooltip =
        "Autocorrect is on — click to turn off" +
        (this.queueCount > 0 ? `. ${this.queueCount} queued fix(es) pending review.` : "");
    } else {
      this.item.text = `$(circle-slash) Autocorrect${queued}`;
      this.item.tooltip = "Autocorrect is off — click to turn on";
    }
  }

  /** Number of queued fixes shown next to the status bar label. */
  setQueueCount(n: number): void {
    this.queueCount = n;
    this.refresh();
  }

  /** Wrap an async operation so the spinner shows while it runs. */
  async withBusy<T>(op: () => Promise<T>): Promise<T> {
    this.busyCount++;
    this.refresh();
    try {
      return await op();
    } finally {
      this.busyCount--;
      this.refresh();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
