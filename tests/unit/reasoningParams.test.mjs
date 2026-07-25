import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReasoningExtras } from "../../out/reasoningParams.js";
import {
  DEFAULT_PROFILES,
  effectiveMaxTokensLine,
  normalizeProfile,
  resolveProfiles,
} from "../../out/profiles.js";
import {
  parseAnthropicResponse,
  parseGeminiResponse,
  parseOpenAiChatResponse,
} from "../../out/llmResponse.js";

describe("reasoningParams", () => {
  it("Groq off sends reasoning_effort none for reasoning models", () => {
    const profile = normalizeProfile({
      id: "g",
      label: "g",
      provider: "groq",
      model: "qwen/qwen3-32b",
      reasoningMode: "off",
    });
    const extras = buildReasoningExtras(profile);
    assert.equal(extras.openAiBody?.reasoning_effort, "none");
    assert.equal(extras.openAiBody?.reasoning_format, "hidden");
  });

  it("Groq log sends low effort and parsed format", () => {
    const profile = normalizeProfile({
      id: "g",
      label: "g",
      provider: "groq",
      model: "qwen/qwen3-32b",
      reasoningMode: "log",
      reasoningEffort: "low",
    });
    const extras = buildReasoningExtras(profile);
    assert.equal(extras.openAiBody?.reasoning_effort, "low");
    assert.equal(extras.openAiBody?.reasoning_format, "parsed");
  });

  it("Groq llama instant omits reasoning_effort", () => {
    const profile = normalizeProfile({
      id: "g",
      label: "g",
      provider: "groq",
      model: "llama-3.1-8b-instant",
      reasoningMode: "log",
    });
    const extras = buildReasoningExtras(profile);
    assert.equal(extras.openAiBody, undefined);
  });

  it("local qwen off disables thinking via chat_template_kwargs", () => {
    const profile = normalizeProfile({
      id: "l",
      label: "l",
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "qwen",
      reasoningMode: "off",
    });
    const extras = buildReasoningExtras(profile);
    assert.deepEqual(extras.openAiBody?.chat_template_kwargs, { enable_thinking: false });
  });

  it("local log enables thinking", () => {
    const profile = normalizeProfile({
      id: "l",
      label: "l",
      provider: "openai-compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "local",
      reasoningMode: "log",
    });
    const extras = buildReasoningExtras(profile);
    assert.deepEqual(extras.openAiBody?.chat_template_kwargs, { enable_thinking: true });
  });

  it("Anthropic log adds thinking for sonnet-4", () => {
    const profile = normalizeProfile({
      id: "a",
      label: "a",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      reasoningMode: "log",
      reasoningEffort: "medium",
    });
    const extras = buildReasoningExtras(profile);
    assert.ok(extras.anthropicBody?.thinking);
    assert.equal(extras.anthropicBody?.output_config?.effort, "medium");
  });

  it("Gemini off sets thinkingBudget 0 for 2.5", () => {
    const profile = normalizeProfile({
      id: "gem",
      label: "gem",
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      reasoningMode: "off",
    });
    const extras = buildReasoningExtras(profile);
    assert.deepEqual(extras.geminiGenerationConfig?.thinkingConfig, { thinkingBudget: 0 });
  });
});

describe("llmResponse parsing", () => {
  it("parses OpenAI reasoning_content", () => {
    const parsed = parseOpenAiChatResponse({
      choices: [
        {
          finish_reason: "length",
          message: { content: "print(x)", reasoning_content: "think step" },
        },
      ],
    });
    assert.equal(parsed.content, "print(x)");
    assert.equal(parsed.reasoning, "think step");
    assert.equal(parsed.finishReason, "length");
  });

  it("parses Anthropic thinking blocks", () => {
    const parsed = parseAnthropicResponse({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "fixed()" },
      ],
    });
    assert.equal(parsed.content, "fixed()");
    assert.equal(parsed.reasoning, "hmm");
  });

  it("parses Gemini thought parts", () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "inner", thought: true },
              { text: "out()" },
            ],
          },
        },
      ],
    });
    assert.equal(parsed.content, "out()");
    assert.equal(parsed.reasoning, "inner");
  });
});

describe("default profiles", () => {
  it("returns five built-in profiles when settings empty", () => {
    const profiles = resolveProfiles([], "groq", "", "");
    assert.equal(profiles.length, 5);
    assert.deepEqual(
      profiles.map((p) => p.id),
      DEFAULT_PROFILES.map((p) => p.id)
    );
  });

  it("local profile defaults to log + 1024 line tokens", () => {
    const local = resolveProfiles([], "groq", "", "").find((p) => p.id === "local");
    assert.equal(local?.reasoningMode, "log");
    assert.equal(effectiveMaxTokensLine(local), 1024);
  });

  it("legacy migration still works", () => {
    const profiles = resolveProfiles(
      [],
      "openai-compatible",
      "m",
      "http://127.0.0.1:8080/v1"
    );
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].id, "default");
    assert.equal(profiles[0].reasoningMode, "log");
  });
});
