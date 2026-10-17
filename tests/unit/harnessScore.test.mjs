import { test } from "node:test";
import assert from "node:assert/strict";
import { alignLines, scoreHarness } from "../../out/harnessScore.js";

test("alignment uses exact trimmed anchors and pairs changed lines in order", () => {
  assert.deepEqual(alignLines(["a", "b", "c", "d"], ["a ", "wrong", "c", "d  "]), [0, 1, 2, 3]);
  assert.deepEqual(alignLines(["a", "b", "c"], ["a", ")", "b", "c"]), [0, 2, 3]);
  assert.deepEqual(alignLines(["a", "b", "c"], ["a", "c"]), [0, undefined, 1]);
  assert.deepEqual(alignLines(["a", "b"], ["x", "y"]), [0, 1]);
  assert.deepEqual(alignLines(["a", "b", "c"], ["a", "c", "x"]), [0, 2, 1]);
  assert.deepEqual(alignLines([], ["a"]), []);
  assert.deepEqual(alignLines(["a"], []), [undefined]);
});

test("duplicate clean lines align to distinct actual lines", () => {
  assert.deepEqual(alignLines(["same", "same", "end"], ["same", ")", "same", "end"]), [0, 2, 3]);
});

test("scoring covers all five outcomes and precision/recall denominators", () => {
  const score = scoreHarness([
    { insert: "pritn(x)", clean: "print(x)" },
    { insert: "retrun x", clean: "return x" },
    { insert: "totl = 0", clean: "total = 0" },
    { insert: "a = 1", clean: "a = 1" },
    { insert: "b = 2", clean: "b = 2" },
  ], ["print(x)", "retrun x", "other = 0", "a = 1   ", "b = 3"]);
  for (const kind of ["fixed", "missed", "wrongFix", "keptCorrect", "brokeCorrect"]) assert.equal(score[kind], 1, kind);
  assert.equal(score.precision, 1 / 3);
  assert.equal(score.recall, 1 / 3);
  assert.equal(score.outcomes[0].index, 0);
  assert.equal(score.outcomes[2].final, "other = 0");
});

test("extra closing bracket from a multi-line fix preserves clean LCS anchors", () => {
  const score = scoreHarness([
    { insert: "reslt = compute(a, b", clean: "result = compute(a, b" },
    { insert: "pritn(result)", clean: "print(result)" },
    { insert: "retrun result", clean: "return result" },
  ], ["result = compute(a, b", ")", "print(result)", "return result", ""]);
  assert.deepEqual(score.outcomes.map((outcome) => outcome.kind), ["fixed", "fixed", "fixed"]);
  assert.equal(score.precision, 1);
  assert.equal(score.recall, 1);
});

test("empty scores, deleted lines, and trailing spaces", () => {
  assert.equal(scoreHarness([], []).precision, 0);
  assert.equal(scoreHarness([], []).recall, 0);
  assert.equal(scoreHarness([{ insert: "a", clean: "a" }], []).brokeCorrect, 1);
  assert.equal(scoreHarness([{ insert: "a  ", clean: "a" }], ["a "]).keptCorrect, 1);
});

test("unmatched lines follow the specified global fallback even around inserted punctuation", () => {
  const score = scoreHarness([
    { insert: "a", clean: "a" },
    { insert: "retrun result", clean: "return result" },
  ], ["a", ")", "retrun result"]);
  assert.equal(score.outcomes[1].final, ")");
  assert.equal(score.outcomes[1].kind, "wrongFix");
});
