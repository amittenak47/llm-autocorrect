import * as vscode from "vscode";
import { StatusBar } from "./statusBar";

export type OutcomeKind = "info" | "skip" | "error" | "ok";

/**
 * Surface user-visible outcomes: status bar + Output channel.
 * Keeps last error on the status bar tooltip via StatusBar.setLastError.
 */
export function reportOutcome(
  message: string,
  opts: {
    kind?: OutcomeKind;
    output?: vscode.OutputChannel;
    logPrefix?: string;
    statusBar?: StatusBar;
    modelText?: string;
    durationMs?: number;
  } = {}
): void {
  const kind = opts.kind ?? "info";
  const duration = opts.durationMs ?? (kind === "ok" ? 3000 : 6000);
  const full = message.startsWith("Autocorrect:") ? message : `Autocorrect: ${message}`;
  vscode.window.setStatusBarMessage(full, duration);
  if (opts.statusBar && (kind === "skip" || kind === "error")) {
    opts.statusBar.setLastError(full);
  } else if (opts.statusBar && kind === "ok") {
    opts.statusBar.setLastError(undefined);
  }
  if (opts.output) {
    const prefix = opts.logPrefix ?? `[${kind}]`;
    opts.output.appendLine(`${prefix} ${message}`);
    if (opts.modelText?.trim()) {
      const snip =
        opts.modelText.length > 800 ? `${opts.modelText.slice(0, 800)}…` : opts.modelText;
      opts.output.appendLine(`${prefix} model output:\n${snip}`);
    }
  }
}

export type RejectAction = "dismiss" | "copy" | "force";

/** After docs/caveman validation failure: let the user recover the paid LLM call. */
export async function offerRejectRecovery(
  reason: string,
  modelText: string,
  output?: vscode.OutputChannel
): Promise<RejectAction> {
  reportOutcome(reason, { kind: "skip", output, modelText });
  const pick = await vscode.window.showQuickPick(
    [
      { label: "Dismiss", description: "Keep skip (see Output for model text)", action: "dismiss" as const },
      { label: "Copy model text", description: "Copy rejected output to clipboard", action: "copy" as const },
      { label: "Force apply", description: "Apply anyway (buffer must still match)", action: "force" as const },
    ],
    {
      title: "Autocorrect: model output rejected",
      placeHolder: reason,
      ignoreFocusOut: true,
    }
  );
  if (!pick || pick.action === "dismiss") {
    return "dismiss";
  }
  if (pick.action === "copy") {
    await vscode.env.clipboard.writeText(modelText);
    reportOutcome("copied rejected model text", { kind: "info", output });
    return "copy";
  }
  return "force";
}
