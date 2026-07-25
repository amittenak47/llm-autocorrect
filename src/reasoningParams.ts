import { isLocalBaseUrl } from "./localUrl";
import {
  LlmProfileConfig,
  ReasoningEffort,
  ReasoningMode,
  effectiveReasoningMode,
} from "./profiles";

export interface ReasoningRequestExtras {
  /** Merged into OpenAI-style chat/completions JSON body. */
  openAiBody?: Record<string, unknown>;
  /** Anthropic messages body fields. */
  anthropicBody?: Record<string, unknown>;
  /** Gemini generationConfig fields. */
  geminiGenerationConfig?: Record<string, unknown>;
}

function isGroqReasoningModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("qwen") ||
    m.includes("gpt-oss") ||
    m.includes("deepseek-r1") ||
    m.includes("reasoning")
  );
}

function groqEffort(profile: LlmProfileConfig, mode: ReasoningMode): string | undefined {
  const model = (profile.model ?? "").toLowerCase();
  if (!isGroqReasoningModel(model)) {
    return undefined;
  }
  if (mode === "off") {
    return profile.reasoningEffort === "default" ? "default" : "none";
  }
  const effort = profile.reasoningEffort ?? "low";
  if (effort === "none") {
    return "low";
  }
  if (effort === "default") {
    return "default";
  }
  return effort;
}

function anthropicThinking(profile: LlmProfileConfig, mode: ReasoningMode): Record<string, unknown> | undefined {
  const model = (profile.model ?? "").toLowerCase();
  const supports =
    model.includes("sonnet-4") ||
    model.includes("opus-4") ||
    model.includes("haiku-4") ||
    model.includes("3-7");
  if (!supports) {
    return undefined;
  }
  if (mode === "off") {
    return undefined;
  }
  const effort = profile.reasoningEffort ?? "low";
  if (effort === "none") {
    return { thinking: { type: "enabled", budget_tokens: 1024 } };
  }
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: effort === "default" ? "low" : effort },
  };
}

function geminiThinking(profile: LlmProfileConfig, mode: ReasoningMode): Record<string, unknown> | undefined {
  const model = (profile.model ?? "").toLowerCase();
  if (!model.includes("2.5") && !model.includes("thinking")) {
    return undefined;
  }
  if (mode === "off") {
    return { thinkingConfig: { thinkingBudget: 0 } };
  }
  return { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } };
}

function localOpenAiExtras(profile: LlmProfileConfig, mode: ReasoningMode): Record<string, unknown> | undefined {
  if (profile.provider !== "openai-compatible" || !isLocalBaseUrl(profile.baseUrl ?? "")) {
    return undefined;
  }
  if (mode === "off") {
    // Always try to disable thinking — model id is often "local", not "qwen".
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return { chat_template_kwargs: { enable_thinking: true } };
}

/** Provider-specific request fields for reasoning off vs log. */
export function buildReasoningExtras(
  profile: LlmProfileConfig,
  globalMode?: ReasoningMode
): ReasoningRequestExtras {
  const mode = effectiveReasoningMode(profile, globalMode);
  const extras: ReasoningRequestExtras = {};

  if (profile.provider === "groq") {
    const effort = groqEffort(profile, mode);
    if (effort) {
      extras.openAiBody = {
        reasoning_effort: effort,
        reasoning_format: mode === "log" ? "parsed" : "hidden",
      };
    }
  } else if (profile.provider === "openai-compatible") {
    const local = localOpenAiExtras(profile, mode);
    if (local) {
      extras.openAiBody = local;
    }
  } else if (profile.provider === "anthropic") {
    const thinking = anthropicThinking(profile, mode);
    if (thinking) {
      extras.anthropicBody = thinking;
    }
  } else if (profile.provider === "gemini") {
    const thinking = geminiThinking(profile, mode);
    if (thinking) {
      extras.geminiGenerationConfig = thinking;
    }
  }

  return extras;
}

export function defaultReasoningEffort(profile: LlmProfileConfig): ReasoningEffort {
  if (profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "")) {
    return "default";
  }
  if (profile.provider === "groq") {
    return "none";
  }
  return "none";
}
