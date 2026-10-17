/** Parsed LLM chat response (apply text + optional reasoning for debug log). */
export interface ParsedLlmResponse {
  content: string;
  reasoning?: string;
  finishReason?: string;
}

/** OpenAI-compatible chat/completions (Groq, llama-server, Ollama). */
export function parseOpenAiChatResponse(data: unknown): ParsedLlmResponse {
  const d = data as {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        reasoning?: string | null;
      };
    }>;
  };
  const choice = d.choices?.[0];
  const msg = choice?.message ?? {};
  const content = typeof msg.content === "string" ? msg.content : "";
  const reasoning =
    (typeof msg.reasoning_content === "string" && msg.reasoning_content) ||
    (typeof msg.reasoning === "string" && msg.reasoning) ||
    undefined;
  return {
    content,
    reasoning: reasoning?.trim() || undefined,
    finishReason: choice?.finish_reason,
  };
}

/** Anthropic Messages API. */
export function parseAnthropicResponse(data: unknown): ParsedLlmResponse {
  const d = data as {
    content?: Array<{ type: string; text?: string; thinking?: string }>;
    stop_reason?: string;
  };
  const blocks = d.content ?? [];
  const thinking = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("\n")
    .trim();
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    content: text,
    reasoning: thinking || undefined,
    finishReason: d.stop_reason,
  };
}

/** Gemini generateContent. */
export function parseGeminiResponse(data: unknown): ParsedLlmResponse {
  const d = data as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      finishReason?: string;
    }>;
  };
  const parts = d.candidates?.[0]?.content?.parts ?? [];
  const thoughts: string[] = [];
  const texts: string[] = [];
  for (const p of parts) {
    if (p.thought && p.text) {
      thoughts.push(p.text);
    } else if (p.text) {
      texts.push(p.text);
    }
  }
  return {
    content: texts.join(""),
    reasoning: thoughts.length > 0 ? thoughts.join("\n") : undefined,
    finishReason: d.candidates?.[0]?.finishReason,
  };
}

export function isTruncatedFinish(reason?: string): boolean {
  return reason === "length" || reason === "max_tokens" || reason === "MAX_TOKENS";
}

export class TruncatedResponseError extends Error {
  constructor(profileId: string) {
    super(`Model output was cut off (max tokens) — raise maxTokensLine/maxTokensBlock on profile "${profileId}".`);
    this.name = "TruncatedResponseError";
  }
}
