import { isLocalBaseUrl } from "./localUrl";
import { LlmProfileConfig } from "./profiles";
import { containsSecret } from "./secretRedact";

export const DEFAULT_EXCLUDE_GLOBS = [
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa*",
  "**/id_ed25519*",
  "**/*.p12",
  "**/*.pfx",
  "**/secrets.*",
  "**/*secret*.json",
  "**/credentials*",
  "**/.aws/**",
  "**/.ssh/**",
  "**/.npmrc",
  "**/.pypirc",
  "**/*.kdbx"
];

export function shouldSkipSecretTarget(text: string, profile: LlmProfileConfig, enabled: boolean): boolean {
  return enabled &&
    (profile.provider !== "openai-compatible" || !isLocalBaseUrl(profile.baseUrl ?? "")) &&
    containsSecret(text);
}
