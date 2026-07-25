import * as vscode from "vscode";
import { activeLlmProfile, cfg } from "./config";
import {
  parseAnthropicResponse,
  parseGeminiResponse,
  parseOpenAiChatResponse,
  ParsedLlmResponse,
} from "./llmResponse";
import { capMaxTokens } from "./promptLimits";
import { effectiveReasoningMode, LlmProfileConfig } from "./profiles";
import { buildReasoningExtras } from "./reasoningParams";
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

const REASONING_LOG_MAX = 2000;

export function secretKeyFor(provider: string): string {
  return `autocorrect.apiKey.${provider}`;
}

export function secretKeyForProfile(profileId: string, provider: string): string {
  return `autocorrect.apiKey.${profileId}`;
}

export class LlmClient {
  private output?: vscode.OutputChannel;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  setOutput(output: vscode.OutputChannel): void {
    this.output = output;
  }

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
    const globalMode = cfg().reasoningMode;
    const reasoningExtras = buildReasoningExtras(profile, globalMode);

    switch (profile.provider) {
      case "groq":
        return this.finishParsed(
          profile,
          await this.openAiChat(
            "https://api.groq.com/openai/v1/chat/completions",
            apiKey!,
            model,
            profile,
            { ...req, maxTokens },
            reasoningExtras.openAiBody,
            req.signal
          )
        );
      case "openai-compatible": {
        if (!profile.baseUrl) {
          throw new Error(`Profile "${profile.id}" needs baseUrl (e.g. http://127.0.0.1:8080/v1).`);
        }
        return this.finishParsed(
          profile,
          await this.openAiChat(
            `${profile.baseUrl.replace(/\/+$/, "")}/chat/completions`,
            apiKey ?? "",
            model,
            profile,
            { ...req, maxTokens },
            reasoningExtras.openAiBody,
            req.signal
          )
        );
      }
      case "gemini":
        return this.finishParsed(
          profile,
          await this.gemini(
            apiKey!,
            model,
            { ...req, maxTokens },
            reasoningExtras.geminiGenerationConfig,
            req.signal
          )
        );
      case "anthropic":
        return this.finishParsed(
          profile,
          await this.anthropic(
            apiKey!,
            model,
            profile,
            { ...req, maxTokens },
            reasoningExtras.anthropicBody,
            req.signal
          )
        );
      default:
        throw new Error(`Unknown provider "${profile.provider}" on profile "${profile.id}".`);
    }
  }

  private finishParsed(profile: LlmProfileConfig, parsed: ParsedLlmResponse): string {
    this.emitReasoning(profile, parsed);
    return parsed.content;
  }

  private emitReasoning(profile: LlmProfileConfig, parsed: ParsedLlmResponse): void {
    const globalMode = cfg().reasoningMode;
    const mode = effectiveReasoningMode(profile, globalMode);
    const debug = cfg().debug;

    if (parsed.reasoning && mode === "log") {
      const snip =
        parsed.reasoning.length > REASONING_LOG_MAX
          ? parsed.reasoning.slice(0, REASONING_LOG_MAX) + "…"
          : parsed.reasoning;
      this.output?.appendLine(`[llm:${profile.id}:reasoning] ${snip}`);
    }

    if (!parsed.content.trim() && parsed.reasoning && (debug || mode === "log")) {
      this.output?.appendLine(
        `[llm:${profile.id}] empty content — reasoning consumed tokens` +
          (parsed.finishReason ? ` (finish=${parsed.finishReason})` : "") +
          `. Try reasoningMode=off or raise maxTokensLine on profile "${profile.id}".`
      );
    }
  }

  private async openAiChat(
    url: string,
    apiKey: string,
    model: string,
    profile: LlmProfileConfig,
    req: LlmRequest,
    extraBody: Record<string, unknown> | undefined,
    signal: AbortSignal
  ): Promise<ParsedLlmResponse> {
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
        ...extraBody,
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return parseOpenAiChatResponse(data);
  }

  private async gemini(
    apiKey: string,
    model: string,
    req: LlmRequest,
    extraGenerationConfig: Record<string, unknown> | undefined,
    signal: AbortSignal
  ): Promise<ParsedLlmResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          maxOutputTokens: req.maxTokens,
          temperature: 0,
          ...extraGenerationConfig,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return parseGeminiResponse(data);
  }

  private async anthropic(
    apiKey: string,
    model: string,
    profile: LlmProfileConfig,
    req: LlmRequest,
    extraBody: Record<string, unknown> | undefined,
    signal: AbortSignal
  ): Promise<ParsedLlmResponse> {
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
        ...extraBody,
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    return parseAnthropicResponse(data);
  }
}
