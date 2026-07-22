import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { blockMaxTokens, shiftLine } from "../../out/blockMath.js";

describe("blockMaxTokens", () => {
  it("gives small blocks a floor", () => {
    assert.equal(blockMaxTokens("x = 1"), 256);
  });

  it("scales with input size", () => {
    const small = blockMaxTokens("a".repeat(400));
    const large = blockMaxTokens("a".repeat(4000));
    assert.ok(large > small);
  });

  it("caps very large blocks", () => {
    assert.equal(blockMaxTokens("a".repeat(100000)), 4096);
  });
});

describe("shiftLine", () => {
  it("leaves lines above the change alone", () => {
    assert.deepEqual(shiftLine(2, 5, 5, 1), { line: 2, touched: false });
  });

  it("shifts lines below an insertion down", () => {
    // One line break inserted at line 5 pushes line 8 to line 9.
    assert.deepEqual(shiftLine(8, 5, 5, 1), { line: 9, touched: false });
  });

  it("shifts lines below a deletion up", () => {
    // Lines 5-7 deleted (replaced with nothing) pulls line 10 up by 2.
    assert.deepEqual(shiftLine(10, 5, 7, 0), { line: 8, touched: false });
  });

  it("marks lines inside the change as touched", () => {
    assert.deepEqual(shiftLine(6, 5, 7, 0), { line: 6, touched: true });
  });

  it("marks a same-line edit as touched without moving it", () => {
    assert.deepEqual(shiftLine(4, 4, 4, 0), { line: 4, touched: true });
  });
});
