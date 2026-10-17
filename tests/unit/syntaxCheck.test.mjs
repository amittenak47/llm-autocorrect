import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { defaultWasmDir, dropUnfinished, grammarFor, SyntaxChecker } from "../../out/syntaxCheck.js";

const checker = new SyntaxChecker(defaultWasmDir());

describe("tree-sitter syntax checking with real WASM grammars", () => {
  it("maps supported languages to shipped grammars", () => {
    for (const languageId of ["python", "javascript", "typescript", "go", "java", "rust", "cpp"]) {
      assert.equal(grammarFor(languageId), languageId);
      assert.equal(checker.supports(languageId), true);
    }
    assert.equal(grammarFor("c"), "cpp");
    assert.equal(checker.supports("c"), true);
    for (const languageId of ["zig", "plaintext", "typescriptreact", ""]) {
      assert.equal(grammarFor(languageId), undefined);
      assert.equal(checker.supports(languageId), false);
    }
  });

  it("reports the malformed Python definition on line zero without descending into its ERROR", async () => {
    assert.deepEqual(await checker.errors("python", "defn foo(a):\n    return a\n"), [
      { line: 0, column: 0, endLine: 1, message: "syntax error (parser)" },
    ]);
  });

  it("accepts valid Python after parsing an invalid document", async () => {
    assert.deepEqual(await checker.errors("python", "def foo(a):\n    return a\n"), []);
  });

  it("reports a missing Python colon on line zero", async () => {
    const errors = await checker.errors("python", "def foo(a)\n    return a\n");
    assert.ok(errors?.some((error) => error.line === 0));
  });

  it("reports the error inside a multiline Python call on line one", async () => {
    const errors = await checker.errors("python", "x = compute(a,\n            b c)\n");
    assert.ok(errors?.some((error) => error.line === 1));
  });

  it("reports malformed JavaScript", async () => {
    const errors = await checker.errors("javascript", "function f( {\n}\n");
    assert.ok(errors && errors.length > 0);
  });

  it("reports missing nodes with their token type", async () => {
    assert.deepEqual(await checker.errors("javascript", "function f() { return 1;\n"), [
      { line: 0, column: 24, endLine: 0, message: 'missing "}" (parser)' },
    ]);
  });

  it("accepts valid TypeScript", async () => {
    assert.deepEqual(await checker.errors("typescript", "const n: number = 1;\n"), []);
  });

  it("reports malformed Go", async () => {
    const errors = await checker.errors("go", "func main( {\n}\n");
    assert.ok(errors && errors.length > 0);
  });

  it("loads the remaining grammars and shares the C++ grammar with C", async () => {
    for (const [languageId, text] of [
      ["java", "class Main { public static void main(String[] args) {} }\n"],
      ["rust", "fn main() {}\n"],
      ["cpp", "int main() { return 0; }\n"],
      ["c", "int main(void) { return 0; }\n"],
    ]) {
      assert.deepEqual(await checker.errors(languageId, text), [], languageId);
    }
  });

  it("caps results at fifty and sorts by line then column", async () => {
    const errors = await checker.errors("javascript", "const = 1; const = 2;\n".repeat(80));
    assert.equal(errors?.length, 50);
    assert.deepEqual(errors, [...errors].sort((a, b) => a.line - b.line || a.column - b.column));
  });

  it("handles simultaneous requests while a grammar loads", async () => {
    const fresh = new SyntaxChecker(defaultWasmDir());
    const [invalid, valid, invalidAgain] = await Promise.all([
      fresh.errors("python", "defn foo(a):\n    return a\n"),
      fresh.errors("python", "def foo(a):\n    return a\n"),
      fresh.errors("python", "defn foo(a):\n    return a\n"),
    ]);
    assert.ok(invalid && invalid.length > 0);
    assert.deepEqual(valid, []);
    assert.deepEqual(invalidAgain, invalid);
  });

  it("returns undefined for unsupported languages", async () => {
    assert.equal(await checker.errors("zig", "fn main( {\n"), undefined);
  });

  it("returns undefined repeatedly when a grammar cannot load", async () => {
    const unavailable = new SyntaxChecker(path.join(defaultWasmDir(), "missing-grammars"));
    assert.equal(await unavailable.errors("python", "x = 1\n"), undefined);
    assert.equal(await unavailable.errors("python", "x = 1\n"), undefined);
  });
});

describe("dropUnfinished", () => {
  // shares the module-level checker
  const kept = async (languageId, src, prefixes) =>
    dropUnfinished(await checker.errors(languageId, src), src.split("\n"), prefixes).map((e) => e.line);

  it("ignores code that is still being typed", async () => {
    assert.deepEqual(await kept("javascript", "function f() {\n  ", ["//"]), []);
    assert.deepEqual(await kept("javascript", "const x = [1, 2,\n  ", ["//"]), []);
  });

  it("keeps real typos on balanced lines", async () => {
    assert.deepEqual(await kept("python", "defn foo(a):\n    ", ["#"]), [0]);
    assert.deepEqual(await kept("python", "for i in range(10)\n    ", ["#"]), [0]);
    assert.deepEqual(await kept("javascript", "function f() {\n  cosnt x = 1;\n  ", ["//"]), [1]);
  });
});
