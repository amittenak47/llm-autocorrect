import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CASCADE_DIAG, ROOT_DIAG, diagPatterns, resolveUpstreamTarget } from "../../out/upstreamTarget.js";

const cases = [
  ["python", 'Expected ":"', '"a" is not defined', "Expected 2 positional arguments"],
  ["typescript", "',' expected.", "Cannot find name 'a'.", "Expected 2 arguments, but got 1."],
  ["javascript", "Expression expected.", "Unreachable code detected.", "Expected 2 arguments, but got 1."],
  ["go", "syntax error: unexpected name foo", "undefined: foo", "cannot use x as int value"],
  ["rust", "expected `;`, found `}`", "cannot find value `a` in this scope", "mismatched types"],
  ["java", 'Syntax error, insert ";" to complete Statement', "a cannot be resolved to a variable", "Type mismatch: cannot convert from int to String"],
  ["c", "expected ';' after expression", "use of undeclared identifier 'a'", "too few arguments to function call, expected 2, have 1"],
  ["cpp", "unterminated conditional directive", "unknown type name 'Thing'", "too few arguments to function call, expected 2, have 1"],
  ["zig", "expected ';', found '}'", "use of undeclared identifier 'a'", "unused function parameter"],
];

describe("per-language diagnostic patterns", () => {
  for (const [languageId, root, cascade, semantic] of cases) {
    it(`${languageId}: recognizes roots and cascades, excluding semantic errors`, () => {
      const patterns = diagPatterns(languageId);
      assert.ok(patterns.root.test(root), root);
      assert.ok(patterns.cascade.test(cascade), cascade);
      assert.equal(patterns.root.test(semantic), false, semantic);
      assert.ok(patterns.root.test(root.toUpperCase()), "root is case insensitive");
      assert.ok(patterns.cascade.test(cascade.toUpperCase()), "cascade is case insensitive");
    });
  }

  it("recognizes parser errors and missing tokens as roots in every language", () => {
    for (const [languageId] of cases) {
      assert.ok(diagPatterns(languageId).root.test("syntax error (parser)"), languageId);
      assert.ok(diagPatterns(languageId).root.test('missing ":" (parser)'), languageId);
    }
  });

  it("redirects a cascade to a parser syntax root", () => {
    const diags = [
      { startLine: 0, endLine: 0, message: "syntax error (parser)", severity: 0 },
      { startLine: 1, endLine: 1, message: '"a" is not defined', severity: 0 },
    ];
    assert.equal(resolveUpstreamTarget(1, diags, () => "code", "python"), 0);
  });

  it("does not treat Zig type mismatches as syntax roots", () => {
    assert.equal(diagPatterns("zig").root.test("expected type 'u32', found 'bool'"), false);
    assert.ok(diagPatterns("zig").root.test("expected expression, found ')'"));
  });

  it("retains the exported Python patterns and uses them for unknown language ids", () => {
    for (const id of ["python", "unknown-language", ""]) {
      assert.equal(diagPatterns(id).root, ROOT_DIAG);
      assert.equal(diagPatterns(id).cascade, CASCADE_DIAG);
    }
  });

  it("redirects a TypeScript name cascade to the preceding syntax root", () => {
    const lines = ["function add(a: number, b: number {", "  return a + b;"];
    const diags = [
      { startLine: 0, endLine: 0, message: "',' expected.", severity: 0 },
      { startLine: 1, endLine: 1, message: "Cannot find name 'a'.", severity: 0 },
    ];
    assert.equal(resolveUpstreamTarget(1, diags, (i) => lines[i], "typescript"), 0);
  });

  it("does not redirect TypeScript cascades to a semantic argument-count error", () => {
    const diags = [
      { startLine: 0, endLine: 0, message: "Expected 2 arguments, but got 1.", severity: 0 },
      { startLine: 1, endLine: 1, message: "Cannot find name 'a'.", severity: 0 },
    ];
    assert.equal(resolveUpstreamTarget(1, diags, () => "code", "typescript"), 1);
  });
});
