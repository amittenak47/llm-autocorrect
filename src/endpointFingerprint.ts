import type { LlmProfileConfig } from "./profiles";

/** Bind stored credentials to the provider and endpoint they were saved for. */
export function endpointFingerprint(profile: LlmProfileConfig): string {
  const hosts = {
    groq: "api.groq.com",
    gemini: "generativelanguage.googleapis.com",
    anthropic: "api.anthropic.com",
  };
  const baseUrl = profile.provider === "openai-compatible"
    ? (profile.baseUrl ?? "").replace(/\/+$/, "")
    : hosts[profile.provider];
  return `${profile.provider}|${baseUrl}`;
}

export function secretKeyBindingForProfile(profileId: string): string {
  return `autocorrect.apiKeyBinding.${profileId}`;
}
