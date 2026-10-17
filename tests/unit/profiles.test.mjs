import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILES, migrateLegacyProfile, resolveProfiles } from "../../out/profiles.js";

const resolve = (configured = [], hidden = []) => resolveProfiles(configured, "groq", "", "", hidden);

describe("resolveProfiles", () => {
  it("inherits updated built-in fields for partial overrides", () => {
    const result = resolve([{ id: "groq", timeoutMs: 3000 }]);
    assert.equal(result.length, DEFAULT_PROFILES.length);
    assert.deepEqual(result.find((p) => p.id === "groq"), { ...DEFAULT_PROFILES[0], timeoutMs: 3000 });
    assert.equal(DEFAULT_PROFILES[0].timeoutMs, 5000);
  });

  it("appends custom profiles and ignores incomplete entries", () => {
    const result = resolve([null, {}, { id: "incomplete" }, { provider: "groq" },
      { id: "work", provider: "openai-compatible", baseUrl: "http://gpu-box:8000/v1", label: "Work GPU" }]);
    assert.equal(result.length, DEFAULT_PROFILES.length + 1);
    assert.equal(result.at(-1).id, "work");
    assert.equal(result.at(-1).reasoningMode, "off");
  });

  it("merges each built-in override against its default and appends custom entries", () => {
    const result = resolve([{ id: "groq", timeoutMs: 3000 }, { id: "groq", label: "Latest" },
      { id: "work", provider: "groq" }, { id: "work", provider: "gemini" }]);
    assert.deepEqual(result[0], { ...DEFAULT_PROFILES[0], label: "Latest" });
    assert.deepEqual(result.slice(-2).map((p) => p.provider), ["groq", "gemini"]);
  });

  it("hides ids after merging and restores defaults if everything is hidden", () => {
    assert.equal(resolve([{ id: "gemini", timeoutMs: 3000 }], ["gemini"]).some((p) => p.id === "gemini"), false);
    assert.deepEqual(resolve([], DEFAULT_PROFILES.map((p) => p.id)), resolve());
    assert.equal(resolve([{ id: "work", provider: "groq" }], ["work"]).some((p) => p.id === "work"), false);
  });

  it("preserves the legacy path only when configured is empty", () => {
    const expected = migrateLegacyProfile("openai-compatible", "old-model", "http://localhost:8080/v1");
    assert.deepEqual(resolveProfiles([], "openai-compatible", "old-model", "http://localhost:8080/v1", ["default"]), expected);
    assert.equal(resolveProfiles([{ id: "groq", timeoutMs: 3000 }], "gemini", "legacy", "")[0].id, "groq");
    assert.deepEqual(resolve(), DEFAULT_PROFILES);
  });
});
