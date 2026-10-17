import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { endpointFingerprint } from "../../out/endpointFingerprint.js";
import {
  isTruncatedFinish,
  TruncatedResponseError,
  parseOpenAiChatResponse,
  parseAnthropicResponse,
  parseGeminiResponse,
} from "../../out/llmResponse.js";

describe("endpointFingerprint", () => {
  it("uses official hosts for fixed providers, ignoring configured URLs", () => {
    for (const [provider, host] of [
      ["groq", "api.groq.com"],
      ["gemini", "generativelanguage.googleapis.com"],
      ["anthropic", "api.anthropic.com"],
    ]) {
      assert.equal(endpointFingerprint({ provider, baseUrl: "https://example.test" }), `${provider}|${host}`);
    }
  });

  it("strips trailing slashes and preserves the configured endpoint path", () => {
    const profile = { provider: "openai-compatible", baseUrl: "http://localhost:8080/v1///" };
    assert.equal(endpointFingerprint(profile), "openai-compatible|http://localhost:8080/v1");
    assert.equal(endpointFingerprint({ ...profile, baseUrl: "http://localhost:8080/v1" }), endpointFingerprint(profile));
    assert.notEqual(endpointFingerprint({ ...profile, baseUrl: "https://example.test/v1" }), endpointFingerprint(profile));
    assert.equal(endpointFingerprint({ provider: "openai-compatible" }), "openai-compatible|");
  });

  it("changes when a profile id is reused for another provider", () => {
    const profile = { id: "groq", provider: "groq" };
    assert.notEqual(endpointFingerprint(profile), endpointFingerprint({ ...profile, provider: "openai-compatible", baseUrl: "https://example.test/v1" }));
  });
});

describe("truncated responses", () => {
  it("classifies every provider's token-limit reason", () => {
    for (const reason of ["length", "max_tokens", "MAX_TOKENS"]) {
      assert.equal(isTruncatedFinish(reason), true, reason);
    }
    for (const reason of [undefined, "", "stop", "end_turn", "STOP", "tool_calls"]) {
      assert.equal(isTruncatedFinish(reason), false, reason);
    }
  });

  it("preserves truncation reasons through provider parsers", () => {
    const replies = [
      parseOpenAiChatResponse({ choices: [{ message: { content: "partial" }, finish_reason: "length" }] }),
      parseAnthropicResponse({ content: [{ type: "text", text: "partial" }], stop_reason: "max_tokens" }),
      parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "partial" }] }, finishReason: "MAX_TOKENS" }] }),
    ];
    for (const reply of replies) {
      assert.equal(isTruncatedFinish(reply.finishReason), true);
    }
  });

  it("identifies the profile and token settings in the error", () => {
    const error = new TruncatedResponseError("local");
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Model output was cut off (max tokens) \u2014 raise maxTokensLine/maxTokensBlock on profile \"local\".");
  });
});
