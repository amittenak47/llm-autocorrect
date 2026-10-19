import { test } from "node:test";
import assert from "node:assert/strict";
import { definedNames, builtinNames } from "../../out/fileNames.js";

test("Python definitions, parameters, assignments, bindings, and imports", () => {
  const lines = [
    "import os.path, numpy as np", "from pkg import first, second as alias", "class Thing:",
    "  def run(self, value: int = 1, *args, **kwargs):", "    a, b = value", "    self.total = a",
    "    for item, index in rows:", "      pass", "    with open(path) as handle:",
    "      pass", "    except Exception as error:",
  ];
  const names = definedNames(lines, "python", 5);
  for (const name of ["os", "np", "first", "alias", "Thing", "run", "self", "value", "args", "kwargs", "a", "b", "total", "item", "index", "handle", "error"]) {
    assert.ok(names.includes(name), name);
  }
  assert.ok(!names.includes("numpy"));
  assert.ok(!names.includes("second"));
});

test("names use first definition distance, dedupe, and cap", () => {
  const lines = ["a = 1", "def f(a, b):", "c = 2", "a = 3"];
  assert.deepEqual(definedNames(lines, "python", 3), ["c", "f", "b", "a"]);
  assert.deepEqual(definedNames(lines, "python", 3, 2), ["c", "f"]);
  assert.deepEqual(definedNames(lines, "python", 3, 0), []);
  const paramsFirst = definedNames(["def f(x):", "", "x = 1", "near = 1"], "python", 3);
  assert.ok(paramsFirst.indexOf("near") < paramsFirst.indexOf("x"));
});

test("JS and TS declarations and parameters", () => {
  const names = definedNames(["function build(first, second = 2) {}", "const count = 1; let item; var other;", "class Model {}", "interface Shape {}", "type Name = string;", "const arrow = (value: number, flag = true) => value;"], "typescript", 0);
  for (const name of ["build", "first", "second", "count", "item", "other", "Model", "Shape", "Name", "arrow", "value", "flag"]) assert.ok(names.includes(name), name);
});

test("Go, Rust, Java, C, and C++ functions and parameters", () => {
  for (const [language, code, expected] of [
    ["go", "func add(a, b int) int {", ["add", "a", "b"]],
    ["rust", "fn add(mut a: i32, b: i32) { let mut total = a; }", ["add", "a", "b", "total"]],
    ["java", "public static int add(int a, String label) {", ["add", "a", "label"]],
    ["c", "int add(int a, char *label) {", ["add", "a", "label"]],
    ["cpp", "int add(int a, const Thing& value) {", ["add", "a", "value"]],
  ]) {
    const names = definedNames([code, "struct Point {}; enum Color {};"], language, 0);
    for (const name of expected) assert.ok(names.includes(name), `${language}: ${name}`);
    assert.ok(names.includes("Point"));
    assert.ok(names.includes("Color"));
  }
});

test("comments and strings do not invent declarations", () => {
  assert.deepEqual(definedNames(['# def fake(x):', 'text = "class Fake:"', 'real = 1'], "python", 0), ["text", "real"]);
  assert.deepEqual(definedNames(['// const fake = 1;', 'const text = "function fake(x) {}";', '/* class Fake {} */'], "javascript", 0), ["text"]);
});

test("builtin sets include language keywords and common builtins", () => {
  for (const word of ["return", "print", "enumerate", "None", "self", "super", "ValueError"]) assert.ok(builtinNames("python").has(word), word);
  for (const word of ["const", "console", "Math", "JSON", "Promise"]) assert.ok(builtinNames("typescript").has(word), word);
  for (const [lang, word] of [["go", "defer"], ["rust", "match"], ["java", "String"], ["c", "printf"], ["cpp", "nullptr"]]) assert.ok(builtinNames(lang).has(word));
  assert.ok(!builtinNames("python").has("made_up_name"));
});

test("multiline parameters retain their own first-definition locations and default caps at 60", () => {
  assert.deepEqual(definedNames(["def f(", "  early,", "  late", "):", "  pass"], "python", 2), ["late", "early", "f"]);
  assert.equal(definedNames(Array.from({ length: 70 }, (_, i) => `name${i} = 1`), "python", 0).length, 60);
});
