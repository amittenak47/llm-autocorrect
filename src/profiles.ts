import { CLOUD_DEFAULT_TIMEOUT_MS, LOCAL_DEFAULT_TIMEOUT_MS, isLocalBaseUrl } from "./localUrl";

export type ContextPolicy = "minimal" | "standard" | "extended";
export type LlmProviderKind = "groq" | "gemini" | "anthropic" | "openai-compatible";
export type NearbyMode = "indentScope" | "window";
export type SignatureDepth = "header" | "chain";

export interface ContextTiers {
  nearby: boolean;
  signature: boolean;
  recentEdits: boolean;
  openTabs: boolean;
  yank: boolean;
}

export const DEFAULT_CONTEXT_TIERS: ContextTiers = {
  nearby: true,
  signature: true,
  recentEdits: false,
  openTabs: false,
  yank: false,
};

/** Default tiers when staging/sending a given op (before user toggles 1–5). */
export function tiersForOp(op: "fix" | "docs" | "caveman", base?: ContextTiers): ContextTiers {
  const t = { ...(base ?? DEFAULT_CONTEXT_TIERS) };
  if (op === "caveman") {
    t.signature = false;
    t.recentEdits = false;
    t.openTabs = false;
    t.yank = false;
    t.nearby = true;
  } else {
    t.nearby = true;
    t.signature = true;
  }
  return t;
}

export interface LlmProfileConfig {
  id: string;
  label: string;
  provider: LlmProviderKind;
  model?: string;
  baseUrl?: string;
  contextPolicy?: ContextPolicy;
  timeoutMs?: number;
  /** Max concurrent LLM requests for this profile (default: 1 local, 2 cloud). */
  maxConcurrent?: number;
  color?: string;
}

export const PROFILE_COLORS = [
  "#4a9eff",
  "#2dd4bf",
  "#a78bfa",
  "#fb923c",
  "#f472b6",
];

export function tokenBudgetForPolicy(policy: ContextPolicy): number {
  switch (policy) {
    case "minimal":
      return 512;
    case "standard":
      return 1024;
    case "extended":
      return 2048;
  }
}

export function effectiveProfileTimeout(profile: LlmProfileConfig, globalTimeoutMs: number): number {
  if (profile.timeoutMs !== undefined && profile.timeoutMs > 0) {
    return profile.timeoutMs;
  }
  if (globalTimeoutMs > 0) {
    return globalTimeoutMs;
  }
  if (profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "")) {
    return LOCAL_DEFAULT_TIMEOUT_MS;
  }
  return CLOUD_DEFAULT_TIMEOUT_MS;
}

export function profileColor(profile: LlmProfileConfig, index: number): string {
  return profile.color ?? PROFILE_COLORS[index % PROFILE_COLORS.length];
}

export function defaultMaxConcurrent(profile: LlmProfileConfig): number {
  if (profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "")) {
    return 1;
  }
  return 2;
}

/** Build default profile list from legacy single-provider settings. */
export function migrateLegacyProfile(
  provider: string,
  model: string,
  baseUrl: string
): LlmProfileConfig[] {
  const p: LlmProfileConfig = {
    id: "default",
    label: provider === "openai-compatible" ? "Local" : provider,
    provider: provider as LlmProviderKind,
    model: model || undefined,
    baseUrl: baseUrl || undefined,
    contextPolicy:
      provider === "openai-compatible" && isLocalBaseUrl(baseUrl) ? "extended" : "minimal",
  };
  return [p];
}
