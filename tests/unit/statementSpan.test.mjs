import { test } from "node:test";
import assert from "node:assert/strict";
import { statementSpan } from "../../out/statementSpan.js";

const span = (startLine, endLine) => ({ startLine, endLine });

test("whole statement includes its opening line and intermediate continuations", () => {
  assert.deepEqual(statementSpan(["result = compute(a,", "                 b c)"], 1), span(0, 1));
  assert.deepEqual(statementSpan(["before = 0", "x = fn(", "a,", "b)"], 3), span(1, 3));
  assert.deepEqual(statementSpan(["x = [", "a,", "]"], 2), span(0, 2));
  assert.deepEqual(statementSpan(["x = {", "a: b", "}"], 2), span(0, 2));
});

test("balanced expressions, quoted brackets, and line comments do not expand", () => {
  for (const text of ['s = "("', "s = '['", "s = `({`", "x = f()", "x = 1 # (", "x = 1 // ["]) {
    assert.deepEqual(statementSpan([text, "next"], 1), span(1, 1));
  }
  assert.deepEqual(statementSpan(['s = "escaped \\" ("', "next"], 1), span(1, 1));
});

test("comment prefixes are configurable and quoted comment markers are preserved", () => {
  assert.deepEqual(statementSpan(['x = f("#",', "a)"], 1, 10, ["#"]), span(0, 1));
  assert.deepEqual(statementSpan(["x = a // (", "b"], 1, 10, ["//"]), span(1, 1));
  assert.deepEqual(statementSpan(["x = a // (", "b"], 1, 10, ["#"]), span(0, 1));
});

test("backslash chains expand only through continuation lines", () => {
  assert.deepEqual(statementSpan(["before", "x = a + " + String.fromCharCode(92), "b + " + String.fromCharCode(92), "c"], 3), span(1, 3));
  assert.deepEqual(statementSpan(['s = "\\\\"', "next"], 1), span(1, 1));
});

test("span respects the line limit and never expands downward", () => {
  const lines = ["f(", ...Array(12).fill("a,")];
  assert.deepEqual(statementSpan(lines, 12), span(12, 12));
  assert.deepEqual(statementSpan(lines, 12, 13), span(0, 12));
  assert.deepEqual(statementSpan(["f(", "a)"], 1, 1), span(1, 1));
  assert.deepEqual(statementSpan(["f(", "a)"], 0), span(0, 0));
});

test("brackets inside multiline template strings stay ignored", () => {
  assert.deepEqual(statementSpan(["const s = `(", "still [", "end`;", "next"], 3, 10, ["//"]), span(3, 3));
});


test("block braces do not expand C-family statements but call parentheses do", () => {
  assert.deepEqual(statementSpan(["function sum(xs) {", "  let total = 0;", "  return totl;"], 2, 10, ["//"], false), span(2, 2));
  assert.deepEqual(statementSpan(["foo(a,", "    b c);"], 1, 10, ["//"], false), span(0, 1));
  assert.deepEqual(statementSpan(["function f() {", "  foo(a,", "      b c);"], 2, 10, ["//"], false), span(1, 2));
  assert.deepEqual(statementSpan(["values = {", '    "a": 1,', '    "b": totl}'], 2, 10, ["#"], true), span(0, 2));
});
