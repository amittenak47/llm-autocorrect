import { test } from "node:test";
import assert from "node:assert/strict";
import { toDocumentEol } from "../../out/documentEol.js";

test("normalizes LF, CRLF, and mixed replacements to the document EOL", () => {
  for (const text of ["a\nb\n", "a\r\nb\r\n", "a\r\nb\n"]) {
    assert.equal(toDocumentEol(text, true), "a\r\nb\r\n");
    assert.equal(toDocumentEol(text, false), "a\nb\n");
  }
  for (const crlf of [true, false]) {
    assert.equal(toDocumentEol("", crlf), "");
    assert.equal(toDocumentEol("single line", crlf), "single line");
    assert.equal(toDocumentEol("a\rb", crlf), "a\rb");
  }
});
