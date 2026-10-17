import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectNearbyLines,
  enclosingSignatureText,
  orderContextChunks,
} from "../../out/contextScope.js";
import {
  alignToLineCount,
  mergeCavemanComments,
  normalizeModelText,
} from "../../out/responseIngress.js";
import { stripFences, stripTrailingLineComment } from "../../out/textUtils.js";

describe("textUtils", () => {
  it("stripFences extracts embedded fence after prose", () => {
    assert.equal(stripFences("Sure:\n```py\nx = 1\n```\n"), "x = 1");
  });

  it("stripTrailingLineComment keeps strings", () => {
    assert.equal(stripTrailingLineComment('x = "# not comment"', ["#"]), 'x = "# not comment"');
    assert.equal(stripTrailingLineComment("x = 1  # hi", ["#"]), "x = 1");
  });
});

describe("contextScope", () => {
  it("indentScope stays in block", () => {
    const lines = [
      "class A:",
      "  def f():",
      "    x = 1",
      "    y = 2",
      "  def g():",
      "    z = 3",
    ];
    const nearby = collectNearbyLines(lines, 2, 2, 10, 2, "indentScope");
    assert.ok(nearby.includes("def f():"));
    assert.ok(nearby.includes("y = 2"));
    assert.ok(!nearby.includes("z = 3"));
  });

  it("signature chain returns outer then inner", () => {
    const lines = ["class A:", "  def f():", "    return 1"];
    const sig = enclosingSignatureText(lines, 2, "chain");
    assert.equal(sig, "class A:\ndef f():");
  });

  it("orderContextChunks prioritizes signature before nearby", () => {
    const ordered = orderContextChunks([
      { tier: "target" },
      { tier: "nearby" },
      { tier: "signature" },
    ]);
    assert.deepEqual(
      ordered.map((c) => c.tier),
      ["target", "signature", "nearby"]
    );
  });
});

describe("caveman merge", () => {
  const py = { id: "python", name: "Python", lineCommentPrefixes: ["#"] };

  it("alignToLineCount pads and truncates", () => {
    assert.equal(alignToLineCount("a\nb", 3, true), "a\nb\n");
    assert.equal(alignToLineCount("a\nb\nc", 2, true), "a\nb");
  });

  it("mergeCavemanComments appends comments without rewriting code", () => {
    const original = "x = 1\ny = 2";
    const model = "x = 1  # set x\ny = 2  # set y";
    assert.equal(mergeCavemanComments(original, model, py), "x = 1  # set x\ny = 2  # set y");
  });

  it("mergeCavemanComments rejects code rewrites", () => {
    const original = "x = 1";
    const model = "x = 2  # nope";
    assert.equal(mergeCavemanComments(original, model, py), undefined);
  });

  it("normalizeModelText strips prose-wrapped fences", () => {
    assert.equal(normalizeModelText("Here:\n```\na=1\n```"), "a=1");
  });
});

describe("indented replies and context markers", () => {
  it("preserves first-line spaces and tabs in unfenced replies", () => {
    assert.equal(stripFences("    x = 1\n    y = 2"), "    x = 1\n    y = 2");
    assert.equal(stripFences(" \t\r\n\tfoo()\r\n\tbar()  \r\n"), "\tfoo()\r\n\tbar()");
  });

  it("preserves indentation in full and prose-wrapped fenced replies", () => {
    assert.equal(stripFences("```py\n    x = 1\n    y = 2\n```\n"), "    x = 1\n    y = 2");
    assert.equal(stripFences("Sure:\n```py\n    x = 1\n    y = 2\n```\n"), "    x = 1\n    y = 2");
    assert.equal(normalizeModelText("```py\r\n\tx = 1\r\n```"), "\tx = 1");
  });

  it("places the target marker between above and below lines in both modes", () => {
    const lines = ["def f():", "    a = 1", "    b = 2", "    c = 3", "    d = 4"];
    const expected = "def f():\n    a = 1\n>>> TARGET LINE <<<\n    c = 3\n    d = 4";
    for (const mode of ["indentScope", "window"]) {
      assert.equal(collectNearbyLines(lines, 2, 2, 10, 2, mode, ">>> TARGET LINE <<<"), expected);
      assert.equal(collectNearbyLines(lines, 2, 2, 10, 2, mode), expected.replace(">>> TARGET LINE <<<\n", ""));
      assert.equal(collectNearbyLines(lines, 1, 3, 10, 2, mode, ">>> CODE BLOCK <<<"), "def f():\n>>> CODE BLOCK <<<\n    d = 4");
    }
  });
});
