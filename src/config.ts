import * as vscode from "vscode";

export function cfg() {
  const c = vscode.workspace.getConfiguration("autocorrect");
  return {
    enabled: c.get<boolean>("enabled", true),
    lineEnabled: c.get<boolean>("line.enabled", true),
    pasteEnabled: c.get<boolean>("paste.enabled", true),
    provider: c.get<string>("provider", "groq"),
    model: c.get<string>("model", ""),
    baseUrl: c.get<string>("baseUrl", ""),
    languages: c.get<string[]>("languages", ["python"]),
    requireDiagnostic: c.get<boolean>("line.requireDiagnostic", true),
    fixRequireDiagnostic: c.get<boolean>("fix.requireDiagnostic", false),
    debounceMs: c.get<number>("line.debounceMs", 800),
    diagnosticWaitMs: c.get<number>("line.diagnosticWaitMs", 1500),
    promptPrefix: c.get<string>("prompt.prefix", ""),
    debug: c.get<boolean>("debug", false),
    timeoutMs: c.get<number>("timeoutMs", 5000),
    queueEnabled: c.get<boolean>("queue.enabled", false),
  };
}

export async function setEnabled(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("autocorrect")
    .update("enabled", value, vscode.ConfigurationTarget.Global);
}

export async function setQueueEnabled(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("autocorrect")
    .update("queue.enabled", value, vscode.ConfigurationTarget.Global);
}
