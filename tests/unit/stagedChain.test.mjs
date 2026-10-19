import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chainLabel, runChain } from "../../out/stagedChain.js";

describe("runChain", () => {
  it("runs steps in order on each preceding output", async () => {
    const calls = [];
    const result = await runChain(["fix", "docs", "caveman"], "original", async (op, text, index) => {
      calls.push({ op, text, index });
      return { ok: true, text: `${text}:${op}` };
    });
    assert.deepEqual(calls, [
      { op: "fix", text: "original", index: 0 },
      { op: "docs", text: "original:fix", index: 1 },
      { op: "caveman", text: "original:fix:docs", index: 2 },
    ]);
    assert.deepEqual(result, { ok: true, text: "original:fix:docs:caveman" });
  });

  it("continues after a step passes its input through unchanged", async () => {
    const result = await runChain(["fix", "docs"], "correct code", async (op, text) =>
      ({ ok: true, text: op === "fix" ? text : `docstring\n${text}` }));
    assert.deepEqual(result, { ok: true, text: "docstring\ncorrect code" });
  });

  it("stops at the first failure and returns its zero-based index and op", async () => {
    const calls = [];
    const result = await runChain(["fix", "docs", "caveman"], "typo", async (op) => {
      calls.push(op);
      return op === "fix" ? { ok: true, text: "fixed" } : { ok: false, reason: "docs altered code" };
    });
    assert.deepEqual(calls, ["fix", "docs"]);
    assert.deepEqual(result, { ok: false, reason: "docs altered code", failedStep: 1, op: "docs" });
  });

  it("does not run later steps when the first step fails", async () => {
    const calls = [];
    const result = await runChain(["fix", "docs"], "typo", async (op) => {
      calls.push(op);
      return { ok: false, reason: "request failed" };
    });
    assert.deepEqual(calls, ["fix"]);
    assert.deepEqual(result, { ok: false, reason: "request failed", failedStep: 0, op: "fix" });
  });

  it("passes through an empty chain without calling the generator", async () => {
    assert.deepEqual(await runChain([], "original", async () => assert.fail("unexpected step")),
      { ok: true, text: "original" });
  });
});

describe("chainLabel", () => {
  it("formats the primary op followed by ordered then steps", () => {
    assert.equal(chainLabel("fix", []), "fix");
    assert.equal(chainLabel("fix", ["docs"]), "fix\u2192docs");
    assert.equal(chainLabel("docs", ["caveman"]), "docs\u2192caveman");
    assert.equal(chainLabel("fix", ["docs", "caveman"]), "fix\u2192docs\u2192caveman");
  });
});
