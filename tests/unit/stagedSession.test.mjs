import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { StagedSession } from "../../out/stagedSession.js";

describe("StagedSession chains", () => {
  it("defaults and resets to an independent empty chain", () => {
    const session = new StagedSession();
    const other = new StagedSession();
    assert.deepEqual(session.attributes.then, []);
    session.toggleThen("docs");
    assert.deepEqual(other.attributes.then, []);
    session.resetAttributes("local");
    assert.deepEqual(session.attributes.then, []);
    assert.equal(session.attributes.op, "fix");
    assert.equal(session.attributes.profileId, "local");
  });

  it("toggles steps off and re-adds them at the end", () => {
    const session = new StagedSession();
    session.toggleThen("docs");
    session.toggleThen("caveman");
    assert.deepEqual(session.attributes.then, ["docs", "caveman"]);
    session.toggleThen("docs");
    assert.deepEqual(session.attributes.then, ["caveman"]);
    session.toggleThen("docs");
    assert.deepEqual(session.attributes.then, ["caveman", "docs"]);
  });

  it("rejects the primary op and never has more than two follow-ups", () => {
    const session = new StagedSession();
    session.setDocs();
    assert.equal(session.toggleThen("docs"), "Autocorrect: docs is already the main op");
    assert.deepEqual(session.attributes.then, []);
    for (const op of ["fix", "caveman", "docs"]) session.toggleThen(op);
    assert.deepEqual(session.attributes.then, ["fix", "caveman"]);
    assert.equal(session.attributes.then.length, 2);
    session.setCaveman();
    assert.equal(session.toggleThen("caveman"), "Autocorrect: caveman is already the main op");
  });

  it("D and F remove the new primary from then while retaining the remaining flags", () => {
    const session = new StagedSession();
    session.setContext("keep names");
    session.setProfileId("local");
    session.toggleTier(3);
    const tiers = { ...session.attributes.tiers };
    session.toggleThen("docs");
    session.toggleThen("caveman");
    session.setDocs();
    assert.equal(session.attributes.op, "docs");
    assert.deepEqual(session.attributes.then, ["caveman"]);
    session.setCaveman();
    assert.equal(session.attributes.op, "caveman");
    assert.deepEqual(session.attributes.then, []);
    assert.equal(session.attributes.contextNote, "keep names");
    assert.equal(session.attributes.profileId, "local");
    assert.deepEqual(session.attributes.tiers, tiers);
  });

  it("setFix also removes a fix follow-up", () => {
    const session = new StagedSession();
    session.setDocs();
    session.toggleThen("fix");
    session.setFix();
    assert.deepEqual(session.attributes.then, []);
  });

  it("shows ordered chain text followed by the existing flag labels", () => {
    const session = new StagedSession();
    session.toggleThen("docs");
    session.toggleThen("caveman");
    session.setContext("keep names");
    const flags = session.flagsLabel("Local", 42);
    assert.ok(flags.startsWith("fix\u2192docs\u2192caveman \u00b7 @Local"));
    assert.ok(flags.includes("ctx:12"));
    assert.ok(flags.includes('"keep names"'));
    assert.ok(flags.endsWith("~42tok"));
  });
});

describe("D and F are toggles", () => {
  it("pressing D or F again switches back to fix", async () => {
    const { StagedSession } = await import("../../out/stagedSession.js");
    const session = new StagedSession();
    session.setDocs();
    assert.equal(session.attributes.op, "docs");
    session.setDocs();
    assert.equal(session.attributes.op, "fix");
    session.setCaveman();
    session.setCaveman();
    assert.equal(session.attributes.op, "fix");
    session.setDocs();
    session.setCaveman();
    assert.equal(session.attributes.op, "caveman", "F after D switches the op, it does not toggle back");
  });
});
