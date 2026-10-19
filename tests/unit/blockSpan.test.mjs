import { test } from "node:test";
import assert from "node:assert/strict";
import { enclosingBlockSpan } from "../../out/blockSpan.js";

const span = (startLine, endLine) => ({ startLine, endLine });

test("Python def contains nested blocks and trims trailing blank lines", () => {
  const lines = ["def total(items):", "    value = 0", "    for item in items:", "        if item:", "            value += item", "    return value", "", "", "other = 1"];
  assert.deepEqual(enclosingBlockSpan(lines, 4, "python"), span(0, 5));
  assert.deepEqual(enclosingBlockSpan(lines, 0, "python"), span(0, 5));
  assert.equal(enclosingBlockSpan(lines, 8, "python"), undefined);
});

test("Python chooses the nearest enclosing async def or class", () => {
  const lines = ["class Counter:", "    async def count(self):", "        return 1", "    label = 2", "next = 3"];
  assert.deepEqual(enclosingBlockSpan(lines, 2, "python"), span(1, 2));
  assert.deepEqual(enclosingBlockSpan(lines, 3, "python"), span(0, 3));
});

test("JavaScript braces in strings, escaped quotes and comments do not close a function", () => {
  const lines = ["function total() {", '  const brace = "}\\\"{";', "  // }", "  if (ready) {", "    return '{';", "  }", "}", "outside();"];
  assert.deepEqual(enclosingBlockSpan(lines, 4, "javascript"), span(0, 6));
  assert.equal(enclosingBlockSpan(lines, 7, "javascript"), undefined);
});

test("multiline templates and block comments hide braces and header keywords", () => {
  const lines = ["function total() {", "  const s = `}", "function fake() {", "  `;", "  /* }", "  class Fake { */", "  return s;", "}"];
  assert.deepEqual(enclosingBlockSpan(lines, 6, "javascript"), span(0, 7));
});

test("brace languages support method, arrow, Rust and Go headers", () => {
  for (const [language, header] of [["java", "int total() {"], ["javascript", "const total = () => {"],
    ["rust", "fn total() -> usize {"], ["go", "func total() int {"]]) {
    assert.deepEqual(enclosingBlockSpan([header, "  return 1;", "}"], 1, language), span(0, 2));
  }
  assert.deepEqual(enclosingBlockSpan(["class Counter", "{", "  value = 1;", "}"], 2, "typescript"), span(0, 3));
});

test("returns undefined when no enclosing header exists", () => {
  assert.equal(enclosingBlockSpan(["value = 1", "print(value)"], 1, "python"), undefined);
  assert.equal(enclosingBlockSpan(["const x = 1;", "x++;"], 1, "javascript"), undefined);
  assert.equal(enclosingBlockSpan(["if (ready) {", "  run();", "}"], 1, "javascript"), undefined);
  assert.equal(enclosingBlockSpan(["// function fake() {", "const x = 1;"], 1, "javascript"), undefined);
  assert.equal(enclosingBlockSpan([], 0, "python"), undefined);
});

test("spans obey the line cap and reject invalid cursor positions", () => {
  assert.deepEqual(enclosingBlockSpan(["def f():", "    a = 1", "    return a"], 1, "python", 2), span(0, 1));
  assert.deepEqual(enclosingBlockSpan(["function f() {", "  a();", "  b();", "}"], 1, "javascript", 2), span(0, 1));
  assert.equal(enclosingBlockSpan(["def f():"], -1, "python"), undefined);
  assert.equal(enclosingBlockSpan(["def f():"], 1, "python"), undefined);
  assert.equal(enclosingBlockSpan(["def f():"], 0, "python", 0), undefined);
});

test("a long earlier function does not capture a cursor outside its braces", () => {
  const lines = ["function earlier() {", ...Array(205).fill("  work();"), "}", "outside();"];
  assert.equal(enclosingBlockSpan(lines, lines.length - 1, "javascript"), undefined);
  assert.deepEqual(enclosingBlockSpan(lines, 204, "javascript"), span(0, 199));
  assert.equal(enclosingBlockSpan(["function unfinished() {", "  work();"], 1, "javascript"), undefined);
});
