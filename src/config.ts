import * as vscode from "vscode";
import {
  ContextTiers,
  DEFAULT_CONTEXT_TIERS,
  LlmProfileConfig,
  migrateLegacyProfile,
} from "./profiles";

export function cfg() {
  const c = vscode.workspace.getConfiguration("autocorrect");
  const legacyProvider = c.get<string>("provider", "groq");
  const legacyModel = c.get<string>("model", "");
  const legacyBaseUrl = c.get<string>("baseUrl", "");

  const configuredProfiles = c.get<LlmProfileConfig[]>("profiles", []);
  const profiles =
    configuredProfiles.length > 0
      ? configuredProfiles
      : migrateLegacyProfile(legacyProvider, legacyModel, legacyBaseUrl);

  const activeProfile = c.get<string>("activeProfile", profiles[0]?.id ?? "default");

  const defaultTiers = c.get<Partial<ContextTiers>>("context.defaultTiers", {});

  const disableAutocorrect = c.get<boolean>("disableAutocorrect", false);
  const lineEnabledSetting = c.get<boolean>("line.enabled", true);

  return {
    enabled: c.get<boolean>("enabled", true),
    disableAutocorrect,
    lineEnabled: lineEnabledSetting && !disableAutocorrect,
    pasteEnabled: c.get<boolean>("paste.enabled", true),
    languages: c.get<string[]>("languages", ["python"]),
    requireDiagnostic: c.get<boolean>("line.requireDiagnostic", true),
    fixRequireDiagnostic: c.get<boolean>("fix.requireDiagnostic", false),
    debounceMs: c.get<number>("line.debounceMs", 800),
    diagnosticWaitMs: c.get<number>("line.diagnosticWaitMs", 1500),
    contextLines: c.get<number>("line.contextLines", 10),
    contextLinesBelow: c.get<number>("line.contextLinesBelow", 0),
    maxLineChars: c.get<number>("line.maxLineChars", 200),
    promptPrefix: c.get<string>("prompt.prefix", ""),
    tokenBudget: c.get<number>("context.tokenBudget", 0),
    ringEnabled: c.get<boolean>("context.ringEnabled", false),
    defaultTiers: { ...DEFAULT_CONTEXT_TIERS, ...defaultTiers } as ContextTiers,
    debug: c.get<boolean>("debug", false),
    timeoutMs: c.get<number>("timeoutMs", 0),
    queueEnabled: c.get<boolean>("queue.enabled", false),
    profiles,
    activeProfile,
    // Legacy — used when profiles array is empty fallback only
    provider: legacyProvider,
    model: legacyModel,
    baseUrl: legacyBaseUrl,
  };
}

export function activeLlmProfile(): LlmProfileConfig {
  const c = cfg();
  return c.profiles.find((p) => p.id === c.activeProfile) ?? c.profiles[0];
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

export async function setDisableAutocorrect(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("autocorrect")
    .update("disableAutocorrect", value, vscode.ConfigurationTarget.Global);
}

export async function setActiveProfile(id: string): Promise<void> {
  await vscode.workspace
    .getConfiguration("autocorrect")
    .update("activeProfile", id, vscode.ConfigurationTarget.Global);
}
