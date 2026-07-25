import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatUserContext, formatUserInstruction, mergedContextNotes } from "../../out/promptMerge.js";

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

  it("formatUserInstruction marks staged notes as apply instructions", () => {
    assert.match(
      formatUserInstruction("Code:\ndef add(a, b):", "add typing"),
      /INSTRUCTION \(apply this change to the CODE block\):\nadd typing\n\nCode:\ndef add\(a, b\):/
    );
  });
});
