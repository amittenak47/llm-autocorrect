import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  capMaxTokens,
  estimateTokens,
  trimContextLines,
  GROQ_REQUEST_TOKEN_BUDGET,
} from "../../out/promptLimits.js";

describe("estimateTokens", () => {
  it("estimates from character length", () => {
    assert.ok(estimateTokens("abcd") >= 1);
    assert.ok(estimateTokens("a".repeat(400)) >= 100);
  });
});

describe("capMaxTokens", () => {
  it("caps Groq max_tokens to fit budget", () => {
    const small = capMaxTokens("groq", 8192, "sys", "user");
    assert.ok(small <= 2048);
    assert.ok(small < GROQ_REQUEST_TOKEN_BUDGET);
  });

  it("does not cap other providers", () => {
    assert.equal(capMaxTokens("anthropic", 8192, "sys", "user"), 8192);
  });
});

describe("trimContextLines", () => {
  it("keeps only the last N lines", () => {
    const out = trimContextLines(["a", "b", "c", "d"], 2, 100);
    assert.equal(out, "c\nd");
  });

  it("truncates very long lines", () => {
    const out = trimContextLines(["x".repeat(300)], 1, 50);
    assert.ok(out.endsWith("…"));
    assert.ok(out.length < 300);
  });
});
