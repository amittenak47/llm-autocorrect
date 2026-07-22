import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decorationLineNumbers } from "../../out/queueDeco.js";
import { assembleWithinBudget, dedupeChunks } from "../../out/contextCompress.js";
import { EditRing } from "../../out/editRing.js";
import { isLocalBaseUrl } from "../../out/localUrl.js";
import { effectiveProfileTimeout, tokenBudgetForPolicy } from "../../out/profiles.js";

describe("queueDeco", () => {
  it("emits one line number per queued line", () => {
    assert.deepEqual(decorationLineNumbers({ line: 2, endLine: 5 }), [2, 3, 4, 5]);
    assert.deepEqual(decorationLineNumbers({ line: 4 }), [4]);
  });
});

describe("contextCompress", () => {
  it("assembleWithinBudget never drops P0 target", () => {
    const chunks = [
      { tier: "target", label: "target", text: "x".repeat(400) },
      { tier: "nearby", label: "nearby", text: "y".repeat(400) },
    ];
    const r = assembleWithinBudget(chunks, 50);
    assert.ok(r.includedTiers.includes("target"));
  });

  it("dedupeChunks removes duplicates", () => {
    assert.deepEqual(dedupeChunks(["a", "a", "b"]), ["a", "b"]);
  });
});

describe("editRing", () => {
  it("stores and returns hunks", () => {
    const ring = new EditRing(3);
    ring.record("u", 1, 2, ["a", "b"]);
    assert.equal(ring.get("u").length, 1);
  });
});

describe("localUrl", () => {
  it("detects localhost", () => {
    assert.equal(isLocalBaseUrl("http://127.0.0.1:8080/v1"), true);
    assert.equal(isLocalBaseUrl("https://api.groq.com"), false);
  });
});

describe("profiles", () => {
  it("local profile gets 60s default timeout", () => {
    const t = effectiveProfileTimeout(
      { id: "l", label: "l", provider: "openai-compatible", baseUrl: "http://localhost:8080/v1" },
      0
    );
    assert.equal(t, 60_000);
  });

  it("token budgets by policy", () => {
    assert.equal(tokenBudgetForPolicy("minimal"), 512);
    assert.equal(tokenBudgetForPolicy("extended"), 2048);
  });
});
