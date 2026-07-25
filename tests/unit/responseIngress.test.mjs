import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fixForSingleLineTarget,
  isUnchanged,
  modelLines,
  normalizeModelText,
  preserveLeadingIndent,
} from "../../out/responseIngress.js";

describe("responseIngress", () => {
  it("normalizeModelText strips fences and CRLF", () => {
    assert.equal(normalizeModelText("```py\nfoo()\n```\r\n"), "foo()");
  });

  it("isUnchanged detects UNCHANGED", () => {
    assert.equal(isUnchanged("UNCHANGED"), true);
    assert.equal(isUnchanged("  UNCHANGED  "), true);
    assert.equal(isUnchanged("foo"), false);
  });

  it("modelLines drops UNCHANGED", () => {
    assert.deepEqual(modelLines("UNCHANGED"), []);
    assert.deepEqual(modelLines("a\nb"), ["a", "b"]);
  });

  it("fixForSingleLineTarget keeps extra lines for syntax fixes", () => {
    assert.equal(fixForSingleLineTarget(["def f("]), "def f(");
    assert.equal(fixForSingleLineTarget(["", "def f(", ")"]), "def f(\n)");
    assert.equal(fixForSingleLineTarget(["  ", ""]), undefined);
  });

  it("preserveLeadingIndent keeps Enter auto-indent from the buffer", () => {
    assert.equal(preserveLeadingIndent("    return a + b", "return a + b"), "    return a + b");
    assert.equal(preserveLeadingIndent("\tpritnf(x)", "print(x)"), "\tprint(x)");
    assert.equal(preserveLeadingIndent("  foo", "  bar"), "  bar");
  });
});
