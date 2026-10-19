import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { badgeOps, opGlyph, opMarkerTexts } from "../../out/stageBadge.js";

describe("staged op markers", () => {
  it("names style writes the chain out in run order", () => {
    assert.deepEqual(opMarkerTexts(["fix"], "names"), ["fix"]);
    assert.deepEqual(opMarkerTexts(["fix", "docs"], "names"), ["fix", "→ docs"]);
    assert.deepEqual(opMarkerTexts(["docs", "caveman"], "names"), ["docs", "→ caveman"]);
  });

  it("letters style uses the pressed keys, with a check mark for fix", () => {
    assert.deepEqual(opMarkerTexts(["fix", "docs", "caveman"], "letters"), ["✓", "D", "F"]);
    assert.equal(opGlyph("caveman"), "F");
    assert.equal(badgeOps("fix", ["docs"]), "✓D");
  });
});
