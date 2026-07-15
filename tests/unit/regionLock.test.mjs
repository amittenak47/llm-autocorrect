import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  baselineHash,
  canMergeRegions,
  lineDeltaAfterReplace,
  normalizeRegion,
  regionContainsLine,
  regionsEqual,
  regionsOverlap,
  shiftRegion,
  unionRegion,
} from "../../out/regionLock.js";

describe("regionLock", () => {
  it("detects overlap and containment", () => {
    const a = normalizeRegion(8, 12);
    const b = normalizeRegion(10, 14);
    const c = normalizeRegion(20, 22);
    assert.equal(regionsOverlap(a, b), true);
    assert.equal(regionsOverlap(a, c), false);
    assert.equal(regionContainsLine(a, 10), true);
    assert.equal(regionContainsLine(a, 7), false);
  });

  it("normalizes inverted ranges", () => {
    assert.deepEqual(normalizeRegion(12, 8), { startLine: 8, endLine: 12 });
    assert.equal(regionsEqual(normalizeRegion(5), normalizeRegion(5, 5)), true);
  });

  it("computes line delta after replace", () => {
    assert.equal(lineDeltaAfterReplace(1, "a\nb\nc"), 2);
    assert.equal(lineDeltaAfterReplace(3, "one"), -2);
  });

  it("shifts regions", () => {
    assert.deepEqual(shiftRegion({ startLine: 4, endLine: 6 }, 2), { startLine: 6, endLine: 8 });
  });

  it("unions and merges adjacent regions", () => {
    const a = { startLine: 8, endLine: 10 };
    const b = { startLine: 11, endLine: 12 };
    assert.deepEqual(unionRegion(a, b), { startLine: 8, endLine: 12 });
    assert.equal(canMergeRegions(a, b), true);
  });

  it("hashes baseline text", () => {
    assert.equal(baselineHash("foo"), baselineHash("foo"));
    assert.notEqual(baselineHash("foo"), baselineHash("bar"));
  });
});
