import * as vscode from "vscode";
import { cfg } from "./config";

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly modeItem: vscode.StatusBarItem;
  private busyCount = 0;
  private queueCount = 0;
  private queueByProfile = new Map<string, number>();
  private modeHint: string | undefined;
  private lastError: string | undefined;
  private inMode = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "autocorrect.statusBarClick";
    this.item.show();
    this.modeItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.modeItem.command = "autocorrect.showMenu";
    this.refresh();
  }

  /** True while menu / staged / capture mode is active (click opens command menu). */
  isInMode(): boolean {
    return this.inMode;
  }

  setModeHint(text: string | undefined): void {
    this.modeHint = text;
    this.inMode = !!text;
    this.refresh();
  }

  setLastError(message: string | undefined): void {
    this.lastError = message;
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
      const base =
        (enterOff
          ? "Enter autocorrect off — manual/staged fixes and queue still work."
          : "Autocorrect is on.") +
        (this.inMode
          ? " Click for command menu."
          : " Click to toggle extension off.") +
        (this.queueCount > 0 ? ` ${this.queueCount} queued fix(es).` : "");
      this.item.tooltip = this.lastError ? `${base}\nLast: ${this.lastError}` : base;
    } else {
      this.item.text = `$(circle-slash) Autocorrect${queued}`;
      this.item.tooltip = this.lastError
        ? `Autocorrect is off — click to turn on.\nLast: ${this.lastError}`
        : "Autocorrect is off — click to turn on";
    }

    if (this.modeHint) {
      this.modeItem.text = `$(key) ${this.modeHint}`;
      this.modeItem.tooltip = "Autocorrect mode keys — click for command menu · Esc to exit";
      this.modeItem.show();
    } else {
      this.modeItem.hide();
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
    this.modeItem.dispose();
  }
}
