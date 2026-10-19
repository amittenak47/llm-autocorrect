import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLineChange,
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

describe("applyLineChange", () => {
  const region = { startLine: 5, endLine: 8 };

  it("leaves regions above the change unchanged", () => {
    assert.deepEqual(applyLineChange(region, { startLine: 9, endLine: 10, addedLines: 4 }), {
      region, touched: false,
    });
  });

  it("shifts both ends for insertions and deletions above", () => {
    assert.deepEqual(applyLineChange(region, { startLine: 2, endLine: 2, addedLines: 3 }), {
      region: { startLine: 8, endLine: 11 }, touched: false,
    });
    assert.deepEqual(applyLineChange(region, { startLine: 1, endLine: 4, addedLines: 1 }), {
      region: { startLine: 3, endLine: 6 }, touched: false,
    });
  });

  it("marks overlaps and changes only the end", () => {
    assert.deepEqual(applyLineChange(region, { startLine: 6, endLine: 6, addedLines: 2 }), {
      region: { startLine: 5, endLine: 10 }, touched: true,
    });
    assert.deepEqual(applyLineChange(region, { startLine: 4, endLine: 10, addedLines: 0 }), {
      region: { startLine: 5, endLine: 5 }, touched: true,
    });
    assert.deepEqual(applyLineChange(region, { startLine: 5, endLine: 5, addedLines: 0 }), {
      region, touched: true,
    });
    assert.deepEqual(applyLineChange(region, { startLine: 8, endLine: 8, addedLines: 1 }), {
      region: { startLine: 5, endLine: 9 }, touched: true,
    });
    assert.deepEqual(region, { startLine: 5, endLine: 8 });
  });

  it("tracks a sequence of changes", () => {
    const inserted = applyLineChange(region, { startLine: 1, endLine: 1, addedLines: 2 });
    const touched = applyLineChange(inserted.region, { startLine: 8, endLine: 9, addedLines: 0 });
    assert.deepEqual(touched, { region: { startLine: 7, endLine: 9 }, touched: true });
  });
});
