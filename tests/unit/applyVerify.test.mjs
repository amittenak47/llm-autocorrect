import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyVerdict } from "../../out/applyVerify.js";

const diag = (startLine, message, severity = 0, endLine = startLine) => ({ startLine, endLine, message, severity });
const verdict = (before, after, extra = {}) => verifyVerdict({
  before, after, region: { startLine: 5, endLine: 5 }, lineDelta: 0, diagnosticsUpdated: true, ...extra,
});

describe("post-apply verification verdict", () => {
  it("keeps a fix that removes the target error while an unrelated old error remains", () => {
    const old = diag(6, "Old unrelated error");
    assert.equal(verdict([diag(5, 'Expected ":"'), old], [old]), "keep");
  });

  it("ignores errors on lines the user edited while verification waited", () => {
    // Fix on line 5; the user is half-way through typing line 6.
    assert.equal(verdict([diag(5, 'Expected ":"')], [diag(6, "Expected expression")], { ignoreLines: [6] }), "keep");
    assert.equal(verdict([diag(5, 'Expected ":"')], [diag(6, "Expected expression")]), "revert");
  });

  it("compares counts for parser errors, which all share one message", () => {
    const p = (line) => diag(line, "syntax error (parser)");
    assert.equal(verdict([], [p(6)], { countOnly: true }), "revert");
    assert.equal(verdict([p(5)], [p(5), p(6)], { countOnly: true }), "revert");
    assert.equal(verdict([p(5)], [], { countOnly: true }), "keep");
    assert.equal(verdict([p(5)], [p(5)], { countOnly: true }), "stillFailing");
    assert.equal(verdict([p(5)], [p(5), p(6)], { countOnly: true, ignoreLines: [6] }), "stillFailing");
  });

  it("reverts a replacement error when the count stays equal", () => {
    assert.equal(verdict([diag(5, 'Expected ":"')], [diag(5, "New error")]), "revert");
  });

  it("reverts when a new error increases the count", () => {
    const old = diag(5, "Old error");
    assert.equal(verdict([old], [old, diag(6, "New error")]), "revert");
    assert.equal(verdict([], [diag(5, "New error")]), "revert");
  });

  it("keeps a fix removing two errors and introducing one", () => {
    assert.equal(verdict([diag(5, "Old one"), diag(5, "Old two")], [diag(5, "New error")]), "keep");
  });

  it("reports stillFailing when every target message persists without new errors", () => {
    assert.equal(verdict([diag(5, "Same error")], [diag(7, "Same error")]), "stillFailing");
    assert.equal(verdict([diag(5, "One"), diag(5, "Two")], [diag(4, "One"), diag(7, "Two")]), "stillFailing");
  });

  it("keeps a fix when only some target errors remain", () => {
    assert.equal(verdict([diag(5, "One"), diag(5, "Two")], [diag(5, "Two")]), "keep");
  });

  it("reports unknown without a diagnostics event, regardless of cached messages", () => {
    assert.equal(verdict([diag(5, "Old")], [diag(5, "New")], { diagnosticsUpdated: false }), "unknown");
    assert.equal(verdict([diag(5, "Old")], [], { diagnosticsUpdated: false }), "unknown");
  });

  it("ignores warnings, information and hints, and keeps an error-free window", () => {
    assert.equal(verdict([], [diag(5, "Warning", 1), diag(5, "Information", 2), diag(5, "Hint", 3)]), "keep");
    assert.equal(verdict([diag(5, "Warning", 1)], [diag(5, "Error")]), "revert");
  });

  it("uses inclusive window boundaries and diagnostic range overlap", () => {
    assert.equal(verdict([], [diag(3, "At start")]), "revert");
    assert.equal(verdict([], [diag(7, "At end")]), "revert");
    assert.equal(verdict([], [diag(1, "Spanning", 0, 3)]), "revert");
    assert.equal(verdict([], [diag(2, "Before"), diag(8, "After")]), "keep");
    assert.equal(verdict([diag(2, "Outside")], [diag(5, "Outside")]), "revert");
  });

  it("expands the after window for added lines and contracts it for removed lines", () => {
    assert.equal(verdict([], [diag(9, "New")], { lineDelta: 2 }), "revert");
    assert.equal(verdict([], [diag(10, "Outside")], { lineDelta: 2 }), "keep");
    assert.equal(verdict([], [diag(6, "Outside")], { lineDelta: -2 }), "keep");
    assert.equal(verdict([], [diag(5, "New")], { lineDelta: -2 }), "revert");
  });

  it("checks every line in a multi-line region", () => {
    const region = { startLine: 5, endLine: 8 };
    assert.equal(verdict([diag(5, "First"), diag(8, "Last")], [diag(5, "First")], { region }), "keep");
    assert.equal(verdict([diag(4, "Overlaps target", 0, 6)], [diag(5, "Overlaps target")], { region }), "stillFailing");
  });

  it("compares exact messages and counts diagnostics rather than unique messages", () => {
    assert.equal(verdict([diag(5, "Error")], [diag(5, "error")]), "revert");
    assert.equal(verdict([diag(5, "Old"), diag(6, "Old")], [diag(5, "New")]), "keep");
  });

  it("keeps a fix when only an unrelated nearby error persists (the fixed lines had none)", () => {
    assert.equal(verdict([diag(3, "Nearby")], [diag(3, "Nearby")]), "keep");
    assert.equal(verdict([], []), "keep");
  });
});


describe("parser verification maps error locations", () => {
  const p = (line) => diag(line, "syntax error (parser)");
  const verify = (before, after, extra = {}) => verdict(before.map(p), after.map(p), { countOnly: true, ...extra });

  it("reverts replacement locations at an equal or higher count", () => {
    assert.equal(verify([5], [6]), "revert");
    assert.equal(verify([4], [5]), "revert");
    assert.equal(verify([5], [5, 5]), "revert");
    assert.equal(verify([5, 6], [4]), "keep");
    assert.equal(verify([5], [6], { ignoreLines: [6] }), "keep");
  });

  it("treats the replaced region as one location after expanding or contracting", () => {
    assert.equal(verify([5], [7], { lineDelta: 2 }), "stillFailing");
    assert.equal(verify([5], [8], { lineDelta: 2 }), "revert");
    assert.equal(verify([7], [5], { region: { startLine: 5, endLine: 7 }, lineDelta: -2 }), "stillFailing");
    assert.equal(verify([5], [7], { region: { startLine: 5, endLine: 7 } }), "stillFailing");
  });

  it("shifts errors after the region and keeps earlier locations unchanged", () => {
    assert.equal(verify([6], [8], { lineDelta: 2 }), "keep");
    assert.equal(verify([6], [6], { lineDelta: 2 }), "revert");
    assert.equal(verify([8], [6], { region: { startLine: 5, endLine: 7 }, lineDelta: -2 }), "keep");
    assert.equal(verify([4, 5, 6], [4, 8], { lineDelta: 2 }), "keep");
    assert.equal(verify([4], [4], { lineDelta: 2 }), "keep");
  });
});
