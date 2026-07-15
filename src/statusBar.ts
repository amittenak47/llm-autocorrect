import * as vscode from "vscode";
import { cfg } from "./config";

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private busyCount = 0;
  private queueCount = 0;
  private queueByProfile = new Map<string, number>();

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "autocorrect.toggle";
    this.item.show();
    this.refresh();
  }

  refresh(): void {
    const { enabled, lineEnabled } = cfg();
    const queued = this.formatQueueLabel();
    const enterOff = enabled && !lineEnabled;
    if (this.busyCount > 0) {
      this.item.text = `$(sync~spin) Autocorrect${queued}`;
      this.item.tooltip = "Autocorrect: checking…";
    } else if (enabled) {
      this.item.text = enterOff
        ? `$(sparkle) Autocorrect (manual)${queued}`
        : `$(sparkle) Autocorrect${queued}`;
      this.item.tooltip =
        (enterOff
          ? "Enter autocorrect off — manual/staged fixes and queue still work. Click to turn extension off."
          : "Autocorrect is on — click to turn off") +
        (this.queueCount > 0 ? ` ${this.queueCount} queued fix(es) pending review.` : "");
    } else {
      this.item.text = `$(circle-slash) Autocorrect${queued}`;
      this.item.tooltip = "Autocorrect is off — click to turn on";
    }
  }

  private formatQueueLabel(): string {
    if (this.queueCount <= 0) {
      return "";
    }
    if (this.queueByProfile.size <= 1) {
      return ` (${this.queueCount} queued)`;
    }
    const parts = [...this.queueByProfile.entries()].map(([id, n]) => `${id}:${n}`);
    return ` (${this.queueCount} queued · ${parts.join(" ")})`;
  }

  setQueueSummary(total: number, byProfile: Map<string, number>): void {
    this.queueCount = total;
    this.queueByProfile = byProfile;
    this.refresh();
  }

  /** @deprecated use setQueueSummary */
  setQueueCount(n: number): void {
    this.setQueueSummary(n, new Map());
  }

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
