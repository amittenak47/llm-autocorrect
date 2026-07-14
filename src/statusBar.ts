import * as vscode from "vscode";
import { cfg } from "./config";

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private busyCount = 0;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "autocorrect.toggle";
    this.item.show();
    this.refresh();
  }

  refresh(): void {
    const { enabled } = cfg();
    if (this.busyCount > 0) {
      this.item.text = "$(sync~spin) Autocorrect";
      this.item.tooltip = "Autocorrect: checking…";
    } else if (enabled) {
      this.item.text = "$(sparkle) Autocorrect";
      this.item.tooltip = "Autocorrect is on — click to turn off";
    } else {
      this.item.text = "$(circle-slash) Autocorrect";
      this.item.tooltip = "Autocorrect is off — click to turn on";
    }
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
