import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrateSeededProfiles } from "../../out/profileMigration.js";
import { PACKAGE_DEFAULT_PROFILES_V0_3, SEEDED_PROFILES_V0_3 } from "../../out/seededProfiles.js";

const snapshots = [SEEDED_PROFILES_V0_3, PACKAGE_DEFAULT_PROFILES_V0_3];
const migrate = (stored) => migrateSeededProfiles(stored, snapshots);

describe("migrateSeededProfiles", () => {
  it("drops unchanged built-in copies from both frozen snapshots", () => {
    for (const snapshot of snapshots) {
      assert.equal(Object.isFrozen(snapshot), true);
      assert.ok(snapshot.every(Object.isFrozen));
      const stored = snapshot.map((p) => ({ ...p }));
      assert.deepEqual(migrate(stored), { profiles: [], dropped: snapshot.map((p) => p.id), trimmed: [] });
      assert.deepEqual(stored, snapshot, "input is unchanged");
    }
  });

  it("trims a modified built-in to only its overrides", () => {
    const stored = [{ ...SEEDED_PROFILES_V0_3[0], timeoutMs: 3000 }];
    assert.deepEqual(migrate(stored), { profiles: [{ id: "groq", timeoutMs: 3000 }], dropped: [], trimmed: ["groq"] });
  });

  it("preserves custom profiles and unknown entries unchanged", () => {
    const custom = { id: "work", provider: "groq", timeoutMs: 3000 };
    const stored = [custom, null, "unexpected", { provider: "groq" }, ["groq"]];
    const result = migrate(stored);
    assert.deepEqual(result, { profiles: stored, dropped: [], trimmed: [] });
    assert.equal(result.profiles[0], custom);
  });

  it("ignores absent stored keys and chooses the snapshot with fewest differences", () => {
    assert.deepEqual(migrate([{ id: "groq", timeoutMs: 5000 }]).dropped, ["groq"]);
    const original = SEEDED_PROFILES_V0_3[0];
    const snapshots = [[{ ...original, timeoutMs: 7000, model: "old" }], [{ ...original, timeoutMs: 6000 }]];
    assert.deepEqual(migrateSeededProfiles([{ ...original, timeoutMs: 3000 }], snapshots), {
      profiles: [{ id: "groq", timeoutMs: 3000 }], dropped: [], trimmed: ["groq"],
    });
    assert.deepEqual(migrateSeededProfiles([{ id: "groq", extra: "keep" }], []), {
      profiles: [{ id: "groq", extra: "keep" }], dropped: [], trimmed: [],
    });
  });
});
