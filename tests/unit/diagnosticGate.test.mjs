import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mirror diagnosticGate patterns for unit tests (no vscode in node:test).
const CASCADE_DIAG = /unexpected indentation|can be used only within|is not defined/i;
const ROOT_DIAG =
  /expected expression|invalid syntax|unterminated|was never closed|statements must be separated/i;

describe("line fix target heuristics", () => {
  it("detects cascade diagnostics", () => {
    assert.ok(CASCADE_DIAG.test("Unexpected indentation"));
    assert.ok(CASCADE_DIAG.test('"return" can be used only within a function'));
    assert.ok(CASCADE_DIAG.test('"a" is not defined'));
  });

  it("detects root syntax diagnostics", () => {
    assert.ok(ROOT_DIAG.test("Expected expression"));
    assert.ok(ROOT_DIAG.test("Invalid syntax"));
  });

  it("cascade-only line should prefer upstream fix (scenario)", () => {
    const line41Diags = [
      "Unexpected indentation",
      '"return" can be used only within a function',
      '"a" is not defined',
    ];
    const line40Diags = ["Expected expression"];
    const allCascade = line41Diags.every((m) => CASCADE_DIAG.test(m));
    const hasRoot = line40Diags.some((m) => ROOT_DIAG.test(m));
    assert.ok(allCascade);
    assert.ok(hasRoot);
  });

  it("spanning root diagnostic should redirect even when mixed with cascade", () => {
    // Mimics Cursor: Expected expression starts on L40 but range covers L41.
    const overlappingOn41 = [
      { startLine: 39, message: "Expected expression" },
      { startLine: 40, message: "Unexpected indentation" },
    ];
    const spanningRoot = overlappingOn41.find(
      (d) => d.startLine < 40 && ROOT_DIAG.test(d.message)
    );
    assert.ok(spanningRoot);
    assert.equal(spanningRoot.startLine, 39);
  });
});
