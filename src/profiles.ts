import { CLOUD_DEFAULT_TIMEOUT_MS, LOCAL_DEFAULT_TIMEOUT_MS, isLocalBaseUrl } from "./localUrl";
import { defaultReasoningEffort } from "./reasoningParams";

export type ContextPolicy = "minimal" | "standard" | "extended";
export type LlmProviderKind = "groq" | "gemini" | "anthropic" | "openai-compatible";
export type NearbyMode = "indentScope" | "window";
export type SignatureDepth = "header" | "chain";
export type ReasoningMode = "off" | "log";
export type ReasoningEffort = "none" | "default" | "low" | "medium" | "high";

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
  /** off = minimize reasoning tokens; log = capture reasoning in Output (never applied). */
  reasoningMode?: ReasoningMode;
  /** Provider-specific effort when the model supports it (Groq reasoning models, Anthropic adaptive). */
  reasoningEffort?: ReasoningEffort;
  /** Override line-fix max_tokens (default higher for local / reasoning log). */
  maxTokensLine?: number;
  /** Floor for block-fix max_tokens when reasoning log is on. */
  maxTokensBlock?: number;
}

export const PROFILE_COLORS = [
  "#4a9eff",
  "#2dd4bf",
  "#a78bfa",
  "#fb923c",
  "#f472b6",
  "#94a3b8",
];

/** Built-in profiles when autocorrect.profiles is empty (set API keys per provider). */
export const DEFAULT_PROFILES: LlmProfileConfig[] = [
  {
    id: "groq",
    label: "Groq",
    provider: "groq",
    model: "llama-3.1-8b-instant",
    contextPolicy: "minimal",
    timeoutMs: 5000,
    maxConcurrent: 2,
    reasoningMode: "off",
    reasoningEffort: "none",
    maxTokensLine: 300,
    color: PROFILE_COLORS[0],
  },
  {
    id: "gemini",
    label: "Gemini",
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    contextPolicy: "minimal",
    timeoutMs: 5000,
    maxConcurrent: 2,
    reasoningMode: "off",
    reasoningEffort: "none",
    maxTokensLine: 300,
    color: PROFILE_COLORS[1],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    contextPolicy: "minimal",
    timeoutMs: 5000,
    maxConcurrent: 2,
    reasoningMode: "off",
    reasoningEffort: "none",
    maxTokensLine: 300,
    color: PROFILE_COLORS[2],
  },
  {
    id: "local",
    label: "Granite 4.1 8B",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "local",
    contextPolicy: "extended",
    timeoutMs: 60000,
    maxConcurrent: 1,
    reasoningMode: "off",
    reasoningEffort: "default",
    maxTokensLine: 2048,
    maxTokensBlock: 2048,
    color: PROFILE_COLORS[3],
  },
  {
    id: "guardian",
    label: "Granite Guardian 4.1",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8081/v1",
    model: "local",
    contextPolicy: "minimal",
    timeoutMs: 15000,
    maxConcurrent: 1,
    reasoningMode: "off",
    reasoningEffort: "none",
    maxTokensLine: 256,
    color: PROFILE_COLORS[5],
  },
  {
    id: "ollama",
    label: "Ollama",
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    contextPolicy: "extended",
    timeoutMs: 60000,
    maxConcurrent: 1,
    reasoningMode: "off",
    reasoningEffort: "none",
    maxTokensLine: 512,
    color: PROFILE_COLORS[4],
  },
];

export function normalizeProfile(profile: LlmProfileConfig): LlmProfileConfig {
  return {
    ...profile,
    reasoningMode: profile.reasoningMode ?? "off",
    reasoningEffort: profile.reasoningEffort ?? defaultReasoningEffort(profile),
  };
}

export function effectiveReasoningMode(profile: LlmProfileConfig): ReasoningMode {
  return profile.reasoningMode ?? "off";
}

export function effectiveMaxTokensLine(profile: LlmProfileConfig): number {
  if (profile.maxTokensLine && profile.maxTokensLine > 0) {
    return profile.maxTokensLine;
  }
  const local =
    profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "");
  if (local) {
    // Reasoning models (llama-server, Qwen, etc.) burn output budget before content.
    return 2048;
  }
  return effectiveReasoningMode(profile) === "log" ? 512 : 300;
}

export function effectiveMaxTokensBlock(
  profile: LlmProfileConfig,
  estimated: number
): number {
  const floor = profile.maxTokensBlock ?? 0;
  if (floor > 0) {
    return Math.max(estimated, floor);
  }
  if (
    profile.provider === "openai-compatible" &&
    isLocalBaseUrl(profile.baseUrl ?? "")
  ) {
    return Math.max(estimated, 2048);
  }
  return estimated;
}

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

/** Merge built-in overrides and custom profiles, preserving the legacy fallback. */
export function resolveProfiles(
  configured: Partial<LlmProfileConfig>[],
  legacyProvider: string,
  legacyModel: string,
  legacyBaseUrl: string,
  hidden: string[] = []
): LlmProfileConfig[] {
  const hasLegacy =
    legacyProvider !== "groq" || legacyModel !== "" || legacyBaseUrl !== "";
  if (configured.length === 0 && hasLegacy) {
    return migrateLegacyProfile(legacyProvider, legacyModel, legacyBaseUrl).map(normalizeProfile);
  }
  const merged = DEFAULT_PROFILES.map((p) => ({ ...p }));
  for (const entry of configured) {
    if (!entry || !entry.id) continue;
    const index = DEFAULT_PROFILES.findIndex((p) => p.id === entry.id);
    if (index >= 0) {
      merged[index] = { ...DEFAULT_PROFILES[index], ...entry };
    } else if (entry.provider) {
      merged.push(entry as LlmProfileConfig);
    }
  }
  const visible = merged.filter((p) => !hidden.includes(p.id));
  return (visible.length > 0 ? visible : DEFAULT_PROFILES).map(normalizeProfile);
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
    reasoningMode: "off",
    maxTokensLine:
      provider === "openai-compatible" && isLocalBaseUrl(baseUrl) ? 2048 : 300,
  };
  return [normalizeProfile(p)];
}
