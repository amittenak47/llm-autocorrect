import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decorationLineNumbers } from "../../out/queueDeco.js";
import { assembleWithinBudget, collapseImports, dedupeChunks } from "../../out/contextCompress.js";
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
  it("uses the language comment prefix when collapsing imports", () => {
    assert.equal(collapseImports("import os\nimport sys\nx = 1", "#"), "import os\n# … 1 more import line(s)\nx = 1");
    assert.equal(collapseImports("import a;\nimport b;", "//"), "import a;\n// … 1 more import line(s)");
  });

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

describe("local URL variants", () => {
  it("recognizes IPv6, wildcard IPv4 and all loopback IPv4 hosts", () => {
    for (const url of ["http://[::1]:8080/v1", "http://0.0.0.0:8080/v1", "http://127.0.0.2:1234", "http://127.255.255.255:1234"]) {
      assert.equal(isLocalBaseUrl(url), true, url);
    }
    assert.equal(isLocalBaseUrl("https://api.groq.com"), false);
    assert.equal(isLocalBaseUrl("https://127.0.0.2.example.com"), false);
  });
});
