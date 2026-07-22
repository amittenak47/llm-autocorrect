import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatUserContext, mergedContextNotes } from "../../out/promptMerge.js";

describe("promptMerge", () => {
  it("mergedContextNotes joins non-empty parts", () => {
    assert.equal(mergedContextNotes("global", "session"), "global\n\nsession");
    assert.equal(mergedContextNotes("", "session note"), "session note");
    assert.equal(mergedContextNotes("  ", "  "), "");
  });

  it("formatUserContext wraps body when context is set", () => {
    assert.equal(formatUserContext("Code:\nfoo", ""), "Code:\nfoo");
    assert.match(
      formatUserContext("TARGET:\nbar", "project uses tabs"),
      /User context.*project uses tabs.*TARGET:\nbar/s
    );
  });
});
