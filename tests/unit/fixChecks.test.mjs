import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFix, editDistance } from "../../out/fixChecks.js";
import { builtinNames } from "../../out/fileNames.js";

const check = (original, corrected, names = [], languageId = "python") => checkFix({
  original, corrected, languageId, fileNames: new Set(names), builtins: builtinNames(languageId),
});

test("reject changed literals before other checks", () => {
  assert.deepEqual(check('print("Helo wrold")', 'print("Hello world")'), { ok: false, reason: "changed string literal" });
  assert.equal(check('f("a", "b")', 'f("a", "c")').reason, "changed string literal");
  assert.equal(check('f("a\\nb")', 'f("a\\nb")').ok, true);
  assert.equal(check("print('hello') # a single quote: '", "print('goodbye')").reason, "changed string literal");
});

test("placeholders inside f-strings and template literals count as code", () => {
  assert.equal(check('print(f"total {reslt}")', 'print(f"total {result}")', ["result"]).ok, true);
  assert.equal(check('print(f"totl {result}")', 'print(f"total {result}")', ["result"]).reason, "changed string literal");
  assert.equal(check("console.log(`sum ${totl}`);", "console.log(`sum ${total}`);", ["total"], "javascript").ok, true);
});

test("typos, known names, closing delimiters, and unterminated strings pass", () => {
  for (const [original, corrected, names] of [
    ["pritn(x)", "print(x)"], ["totl = 0", "total = 0", ["total"]],
    ["foo(a, b", "foo(a, b)"], ['print("unterminated', 'print("unterminated")'],
    ["x = 1", "x = known(1)", ["known"]],
    ["result = compute(a, b", "result = compute(a, b\n    )\n];:"],
  ]) assert.deepEqual(check(original, corrected, names), { ok: true }, original);
});

test("invented identifiers rejected outside string literals", () => {
  assert.deepEqual(check("x = 1", "x = foo_bar(1)"), { ok: false, reason: 'invented name "foo_bar"' });
  assert.equal(check('x = "foo_bar"', 'x = foo_bar("foo_bar")').reason, 'invented name "foo_bar"');
  assert.equal(check("x = 1", "x = 1 # invented_name").reason, 'invented name "invented_name"');
  assert.equal(check("x = 1", "x = 1 // invented_name", [], "javascript").reason, 'invented name "invented_name"');
  assert.equal(check('x = `foo_bar`', 'x = foo_bar(`foo_bar`)', [], "javascript").reason, 'invented name "foo_bar"');
});

test("large rewrites fail after allowing known identifiers", () => {
  const original = "total = alpha + beta + gamma + delta";
  const corrected = "different = replacement(argument)";
  assert.deepEqual(check(original, corrected, ["different", "replacement", "argument"]), { ok: false, reason: "change too large" });
  assert.equal(check("abcdefghijklm", "abcdefghijklm" + "\n)".repeat(30)).ok, true);
});

test("edit distance handles insertions, deletions, substitutions, and empty strings", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("abc", ""), 3);
  assert.equal(editDistance("same", "same"), 0);
  assert.equal(editDistance("pritn", "print"), 2);
});


test("literal preservation compares exact contents and multiplicity", () => {
  assert.equal(check('print("hello")', 'print("hello world")').reason, "changed string literal");
  assert.equal(check('msg = "Hello {user}"', 'msg = "Hello {admin}"').reason, "changed string literal");
  assert.equal(check('f("a", "a")', 'f("a", "b")').reason, "changed string literal");
  assert.equal(check('f("a", "b")', 'f("b", "a")').ok, true);
  assert.equal(check('print("")', 'print("hello")').reason, "changed string literal");
  assert.equal(check("console.log(`hello`);", "console.log(`hello world`);", [], "javascript").reason, "changed string literal");
});

test("Python f-string prefixes control brace masking for both literal lists", () => {
  for (const prefix of ["f", "F", "fr", "Fr", "rf", "RF"]) {
    assert.equal(check(`print(${prefix}"total {reslt}")`, `print(${prefix}"total {result}")`, ["result"]).ok, true);
  }
  assert.equal(check('print("total {reslt}")', 'print(f"total {result}")', ["result"]).reason, "changed string literal");
  assert.equal(check('msg = "total ${totl}"', 'msg = "total ${total}"', ["total"]).ok, true);
});
