import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { postEditLine } from "../../out/postEditLine.js";

const change = (startLine, startCharacter, endLine = startLine, endCharacter = startCharacter, addedLines = 1) =>
  ({ startLine, startCharacter, endLine, endCharacter, addedLines });

describe("postEditLine", () => {
  it("maps simultaneous Enters on pre-edit lines 0 and 2 to 0 and 3", () => {
    const changes = [change(0, 5), change(2, 7)];
    assert.equal(postEditLine(changes, 0), 0);
    assert.equal(postEditLine(changes, 1), 3);
  });

  it("does not depend on change order", () => {
    const changes = [change(2, 7), change(0, 5)];
    assert.equal(postEditLine(changes, 0), 3);
    assert.equal(postEditLine(changes, 1), 0);
  });

  it("uses net line deltas from earlier replacements only", () => {
    const changes = [change(0, 0, 2, 3, 0), change(4, 1), change(6, 0)];
    assert.equal(postEditLine(changes, 1), 2);
    assert.equal(postEditLine(changes, 2), 5);
  });

  it("includes changes ending at the target's start character", () => {
    const changes = [change(0, 1, 0, 3), change(0, 3), change(0, 5)];
    assert.equal(postEditLine(changes, 1), 1);
    assert.equal(postEditLine(changes, 0), 0);
  });
});
