import * as vscode from "vscode";
import { activeLlmProfile } from "./config";
import { capMaxTokens } from "./promptLimits";
import { LlmProfileConfig } from "./profiles";
import { stripFences } from "./textUtils";

export { stripFences } from "./textUtils";

export interface LlmRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal: AbortSignal;
}

const PROVIDER_DEFAULTS: Record<string, { model: string }> = {
  groq: { model: "llama-3.1-8b-instant" },
  gemini: { model: "gemini-2.5-flash-lite" },
  anthropic: { model: "claude-haiku-4-5-20251001" },
  "openai-compatible": { model: "local" },
};

export function secretKeyFor(provider: string): string {
  return `autocorrect.apiKey.${provider}`;
}

export function secretKeyForProfile(profileId: string, provider: string): string {
  return `autocorrect.apiKey.${profileId}`;
}

export class LlmClient {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Legacy single-provider path. */
  async complete(req: LlmRequest): Promise<string> {
    const profile = activeLlmProfile();
    return this.completeForProfile(profile, req);
  }

  async completeForProfile(profile: LlmProfileConfig, req: LlmRequest): Promise<string> {
    const model = profile.model || PROVIDER_DEFAULTS[profile.provider]?.model;
    if (!model) {
      throw new Error(
        `No model configured for profile "${profile.id}" — set model in autocorrect.profiles.`
      );
    }
    const apiKey =
      (await this.secrets.get(secretKeyForProfile(profile.id, profile.provider))) ??
      (await this.secrets.get(secretKeyFor(profile.provider)));
    if (!apiKey && profile.provider !== "openai-compatible") {
      throw new Error(`No API key for profile "${profile.id}". Run "Autocorrect: Set API Key".`);
    }

    const maxTokens = capMaxTokens(profile.provider, req.maxTokens, req.system, req.user);

    switch (profile.provider) {
      case "groq":
        return this.openAiChat(
          "https://api.groq.com/openai/v1/chat/completions",
          apiKey!,
          model,
          { ...req, maxTokens },
          req.signal
        );
      case "openai-compatible": {
        if (!profile.baseUrl) {
          throw new Error(`Profile "${profile.id}" needs baseUrl (e.g. http://127.0.0.1:8080/v1).`);
        }
        return this.openAiChat(
          `${profile.baseUrl.replace(/\/+$/, "")}/chat/completions`,
          apiKey ?? "",
          model,
          { ...req, maxTokens },
          req.signal
        );
      }
      case "gemini":
        return this.gemini(apiKey!, model, { ...req, maxTokens }, req.signal);
      case "anthropic":
        return this.anthropic(apiKey!, model, { ...req, maxTokens }, req.signal);
      default:
        throw new Error(`Unknown provider "${profile.provider}" on profile "${profile.id}".`);
    }
  }

  private async openAiChat(
    url: string,
    apiKey: string,
    model: string,
    req: LlmRequest,
    signal: AbortSignal
  ): Promise<string> {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        temperature: 0,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content ?? "";
  }

  private async gemini(
    apiKey: string,
    model: string,
    req: LlmRequest,
    signal: AbortSignal
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { maxOutputTokens: req.maxTokens, temperature: 0 },
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as any;
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p: any) => p.text ?? "").join("");
  }

  private async anthropic(
    apiKey: string,
    model: string,
    req: LlmRequest,
    signal: AbortSignal
  ): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        temperature: 0,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as any;
    return (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }
}
