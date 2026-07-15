import * as vscode from "vscode";
import { activeLlmProfile, cfg } from "./config";
import { CLOUD_DEFAULT_TIMEOUT_MS, LOCAL_DEFAULT_TIMEOUT_MS, isLocalBaseUrl } from "./localUrl";
import { LlmClient } from "./llm";
import { capMaxTokens } from "./promptLimits";
import { effectiveProfileTimeout, LlmProfileConfig } from "./profiles";

export interface RoutedRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal: AbortSignal;
  profileId?: string;
}

export class LlmRouter {
  constructor(private readonly client: LlmClient) {}

  get activeProfile(): LlmProfileConfig {
    return activeLlmProfile();
  }

  listProfiles(): LlmProfileConfig[] {
    return cfg().profiles;
  }

  profileById(id: string): LlmProfileConfig | undefined {
    return cfg().profiles.find((p) => p.id === id);
  }

  cycleProfile(delta: number): LlmProfileConfig {
    const profiles = cfg().profiles;
    const current = profiles.findIndex((p) => p.id === cfg().activeProfile);
    const next = (current + delta + profiles.length) % profiles.length;
    return profiles[next];
  }

  async complete(req: RoutedRequest): Promise<string> {
    const profile = req.profileId
      ? this.profileById(req.profileId) ?? this.activeProfile
      : this.activeProfile;
    const timeoutMs = this.resolveTimeout(profile);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)]);
    const maxTokens = capMaxTokens(profile.provider, req.maxTokens, req.system, req.user);
    return this.client.completeForProfile(profile, { ...req, maxTokens, signal });
  }

  resolveTimeout(profile: LlmProfileConfig): number {
    return effectiveProfileTimeout(profile, cfg().timeoutMs);
  }

  isLocalProfile(profile: LlmProfileConfig): boolean {
    return profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "");
  }
}

export function defaultTimeoutForBaseUrl(baseUrl: string, globalMs: number): number {
  if (globalMs > 0) {
    return globalMs;
  }
  return isLocalBaseUrl(baseUrl) ? LOCAL_DEFAULT_TIMEOUT_MS : CLOUD_DEFAULT_TIMEOUT_MS;
}
