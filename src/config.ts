import * as vscode from "vscode";
import { DEFAULT_EXCLUDE_GLOBS } from "./privacySettings";
import {
  ContextTiers,
  DEFAULT_CONTEXT_TIERS,
  LlmProfileConfig,
  NearbyMode,
  SignatureDepth,
  resolveProfiles,
} from "./profiles";

export type QueueMode = "reviewChanges" | "deferExecution";
export type OnRejectMode = "skip" | "softApply";

let cachedConfig: ReturnType<typeof readConfig> | undefined;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function invalidateConfigCache(): void {
  cachedConfig = undefined;
}

export function cfg(): ReturnType<typeof readConfig> {
  // VS Code may return settings objects as clone-on-write proxies, and freezing a proxy can throw;
  // settings are plain JSON, so freeze a plain copy instead.
  return cachedConfig ??
    (cachedConfig = deepFreeze(JSON.parse(JSON.stringify(readConfig())) as ReturnType<typeof readConfig>));
}

function readConfig() {
  const c = vscode.workspace.getConfiguration("autocorrect");
  const legacyProvider = c.get<string>("provider", "groq");
  const legacyModel = c.get<string>("model", "");
  const legacyBaseUrl = c.get<string>("baseUrl", "");

  const configuredProfiles = c.get<Partial<LlmProfileConfig>[]>("profiles", []);
  const profiles = resolveProfiles(
    configuredProfiles,
    legacyProvider,
    legacyModel,
    legacyBaseUrl,
    c.get<string[]>("hiddenProfiles", [])
  );

  const activeProfile = c.get<string>("activeProfile", profiles[0]?.id ?? "groq");

  const defaultTiers = c.get<Partial<ContextTiers>>("context.defaultTiers", {});

  const disableAutocorrect = c.get<boolean>("disableAutocorrect", false);
  const lineEnabledSetting = c.get<boolean>("line.enabled", true);

  return {
    enabled: c.get<boolean>("enabled", true),
    disableAutocorrect,
    lineEnabled: lineEnabledSetting && !disableAutocorrect,
    pasteEnabled: c.get<boolean>("paste.enabled", true),
    languages: [...c.get<string[]>("languages", ["python"])],
    syntaxUseParser: c.get<boolean>("syntax.useParser", true),
    requireDiagnostic: c.get<boolean>("line.requireDiagnostic", true),
    fixRequireDiagnostic: c.get<boolean>("fix.requireDiagnostic", false),
    debounceMs: c.get<number>("line.debounceMs", 800),
    diagnosticWaitMs: c.get<number>("line.diagnosticWaitMs", 1500),
    contextLines: c.get<number>("line.contextLines", 10),
    contextLinesBelow: c.get<number>("line.contextLinesBelow", 2),
    maxLineChars: c.get<number>("line.maxLineChars", 200),
    promptIncludeDiagnostics: c.get<boolean>("prompt.includeDiagnostics", true),
    promptIncludeNames: c.get<boolean>("prompt.includeNames", true),
    promptExamples: c.get<boolean>("prompt.examples", true),
    lineWholeStatement: c.get<boolean>("line.wholeStatement", true),
    fixLocalChecks: c.get<boolean>("fix.localChecks", true),
    logicProfileId: c.get<string>("logic.profileId", ""),
    logicMaxIssues: c.get<number>("logic.maxIssues", 5),
    promptPrefix: c.get<string>("prompt.prefix", ""),
    excludeGlobs: [...c.get<string[]>("context.excludeGlobs", DEFAULT_EXCLUDE_GLOBS)],
    redactSecrets: c.get<boolean>("privacy.redactSecrets", true),
    skipSecretTargetsForCloud: c.get<boolean>("privacy.skipSecretTargetsForCloud", true),
    tokenBudget: c.get<number>("context.tokenBudget", 0),
    ringEnabled: c.get<boolean>("context.ringEnabled", false),
    nearbyMode: c.get<NearbyMode>("context.nearbyMode", "indentScope"),
    signatureDepth: c.get<SignatureDepth>("context.signatureDepth", "chain"),
    defaultTiers: { ...DEFAULT_CONTEXT_TIERS, ...defaultTiers } as ContextTiers,
    debug: c.get<boolean>("debug", false),
    timeoutMs: c.get<number>("timeoutMs", 0),
    queueEnabled: c.get<boolean>("queue.enabled", false),
    queueMode: c.get<QueueMode>("queue.mode", "reviewChanges"),
    guardianEnabled: c.get<boolean>("guardian.enabled", false),
    guardianProfileId: c.get<string>("guardian.profileId", "guardian"),
    guardianMaxRetries: c.get<number>("guardian.maxRetries", 1),
    onReject: c.get<OnRejectMode>("apply.onReject", "softApply"),
    verifyAfterApply: c.get<boolean>("apply.verifyAfterApply", true),
    verifyWaitMs: c.get<number>("apply.verifyWaitMs", 2000),
    profiles,
    activeProfile,
    // Legacy — used when profiles array is empty fallback only
    provider: legacyProvider,
    model: legacyModel,
    baseUrl: legacyBaseUrl,
  };
}

export function isDeferQueueMode(): boolean {
  return cfg().queueMode === "deferExecution";
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

export async function setRequireDiagnostic(value: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("autocorrect")
    .update("line.requireDiagnostic", value, vscode.ConfigurationTarget.Global);
}
