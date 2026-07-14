import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectLanguage,
  isCommentOrBlank,
  PROFILES,
} from "../../out/languages.js";

describe("isCommentOrBlank", () => {
  const py = PROFILES.python;

  it("skips blank lines", () => {
    assert.equal(isCommentOrBlank("", py), true);
    assert.equal(isCommentOrBlank("   ", py), true);
  });

  it("skips Python comments", () => {
    assert.equal(isCommentOrBlank("# comment", py), true);
    assert.equal(isCommentOrBlank("  # indented", py), true);
  });

  it("does not skip code", () => {
    assert.equal(isCommentOrBlank('pritn("x")', py), false);
    assert.equal(isCommentOrBlank("x = 1  # inline ok", py), false);
  });
});

describe("detectLanguage", () => {
  it("detects Python", () => {
    const r = detectLanguage('def foo():\n    print("hi")');
    assert.equal(r?.profile.id, "python");
    assert.ok(r.score >= 4);
  });

  it("detects C++ over Python for includes", () => {
    const r = detectLanguage('#include <iostream>\nint main() { return 0; }');
    assert.ok(r?.profile.id === "cpp" || r?.profile.id === "c");
  });

  it("returns undefined for empty text", () => {
    assert.equal(detectLanguage(""), undefined);
    assert.equal(detectLanguage("   \n  "), undefined);
  });
});
