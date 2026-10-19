import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CASCADE_DIAG,
  ROOT_DIAG,
  MAX_UPSTREAM_LOOKBACK,
  resolveUpstreamTarget,
  hasUpstreamEvidence,
} from "../../out/upstreamTarget.js";

const diag = (startLine, message, endLine = startLine, severity = 0) => ({ startLine, endLine, message, severity });
const text = (i) => ["defn foo(a)", "    return a"][i] ?? "x = 1";

describe("line fix target heuristics", () => {
  it("detects cascade diagnostics", () => {
    for (const message of ["Unexpected indentation", '\"return\" can be used only within a function', '\"a\" is not defined']) {
      assert.ok(CASCADE_DIAG.test(message));
    }
  });

  it("recognizes syntax roots without treating semantic Expected diagnostics as roots", () => {
    for (const message of ["Expected expression", "Invalid syntax", 'Expected ":"', 'Expected ")"', "Expected indented block", "Expected member name", "Expected parameter name", "Expected class name", "Expected function name", "Expected newline"]) {
      assert.ok(ROOT_DIAG.test(message), message);
    }
    assert.equal(ROOT_DIAG.test("Expected 2 positional arguments"), false);
  });

  it("redirects a cascade-only line under a broken defn to Expected expression", () => {
    assert.equal(resolveUpstreamTarget(1, [
      diag(0, "Expected expression"),
      diag(1, "Unexpected indentation"),
      diag(1, '\"return\" can be used only within a function'),
      diag(1, '\"a\" is not defined'),
    ], text), 0);
  });

  it("redirects a spanning root even with mixed diagnostics on the current line", () => {
    assert.equal(resolveUpstreamTarget(1, [diag(0, "Expected expression", 1), diag(1, "Unexpected indentation")], text), 0);
  });

  it("does not redirect a real typo to an unrelated unresolved import", () => {
    const lines = ["import numpyy as np", "", "x = 1", "pritn(x)"];
    assert.equal(resolveUpstreamTarget(3, [
      diag(0, 'Import "numpyy" could not be resolved'),
      diag(3, '\"pritn\" is not defined'),
    ], (i) => lines[i]), 3);
  });

  it("redirects a return cascade to a missing colon on def", () => {
    const lines = ["def foo(a)", "    return a"];
    assert.equal(resolveUpstreamTarget(1, [diag(0, 'Expected ":"'), diag(1, '\"return\" can be used only within a function')], (i) => lines[i]), 0);
  });

  it("does not redirect to semantic Expected diagnostics", () => {
    assert.equal(resolveUpstreamTarget(1, [diag(0, "Expected 2 positional arguments"), diag(1, '\"x\" is not defined')], text), 1);
  });

  it("bounds spanning roots and walk-up roots to the lookback", () => {
    assert.equal(MAX_UPSTREAM_LOOKBACK, 8);
    assert.equal(resolveUpstreamTarget(43, [diag(1, "String literal is unterminated", 43)], text), 43);
    assert.equal(resolveUpstreamTarget(9, [diag(1, "String literal is unterminated", 9)], text), 1);
    assert.equal(resolveUpstreamTarget(10, [diag(1, "Invalid syntax"), diag(10, "Unexpected indentation")], text), 10);
  });

  it("ignores informational diagnostics and leaves diagnostic-free lines alone", () => {
    assert.equal(resolveUpstreamTarget(1, [diag(0, "Expected expression", 1, 2)], text), 1);
    assert.equal(resolveUpstreamTarget(1, [diag(0, "Expected expression")], text), 1);
    assert.equal(resolveUpstreamTarget(1, [], text), 1);
  });
});

describe("hasUpstreamEvidence", () => {
  it("requires an overlapping error or warning", () => {
    assert.equal(hasUpstreamEvidence(3, []), false);
    assert.equal(hasUpstreamEvidence(3, [diag(3, "error")]), true);
    assert.equal(hasUpstreamEvidence(3, [diag(2, "warning", 4, 1)]), true);
    assert.equal(hasUpstreamEvidence(3, [diag(3, "info", 3, 2)]), false);
    assert.equal(hasUpstreamEvidence(3, [diag(0, "error", 2), diag(4, "error")]), false);
  });
});
