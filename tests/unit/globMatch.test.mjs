import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { globToRegExp, matchesAny } from "../../out/globMatch.js";
import { DEFAULT_EXCLUDE_GLOBS } from "../../out/privacySettings.js";

describe("globMatch", () => {
  it("normalizes Windows paths and matches double-star at the root", () => {
    for (const path of ["C:\\proj\\.env", ".env", "/proj/.ENV", "nested/.env"]) {
      assert.equal(matchesAny(path, ["**/.env"]), true, path);
    }
    assert.equal(matchesAny("src/env.ts", ["**/.env.*"]), false);
    assert.equal(matchesAny(".env.local", ["**/.env.*"]), true);
  });

  it("supports stars, question marks and brace alternatives without crossing segments", () => {
    assert.equal(globToRegExp("src/*.{ts,js}").test("SRC/a.ts"), true);
    assert.equal(matchesAny("src/a.js", ["src/*.{ts,js}"]), true);
    assert.equal(matchesAny("src/nested/a.ts", ["src/*.{ts,js}"]), false);
    assert.equal(matchesAny("src/a.ts", ["src/?.ts"]), true);
    assert.equal(matchesAny("src/ab.ts", ["src/?.ts"]), false);
    assert.equal(matchesAny("src/.ts", ["src/?.ts"]), false);
    assert.equal(matchesAny("a/b/c.ts", ["**/*.ts"]), true);
    assert.equal(matchesAny("x.json", ["**/{a,{x,y}}.json"]), true);
  });

  it("treats regex syntax literally and handles empty inputs", () => {
    assert.equal(matchesAny("a+[x].ts", ["a+[x].ts"]), true);
    assert.equal(matchesAny("ax.ts", ["a+[x].ts"]), false);
    assert.equal(matchesAny("a.ts", []), false);
    assert.equal(matchesAny("", [""]), true);
    assert.equal(matchesAny("file{", ["file{"]), true);
  });

  it("covers every default sensitive-file pattern", () => {
    for (const path of [".env", ".env.production", "cert.pem", "private.key", "id_rsa.pub",
      "id_ed25519", "cert.p12", "cert.pfx", "secrets.yaml", "app-secret-data.json",
      "credentials.json", ".aws/config", ".ssh/config", ".npmrc", ".pypirc", "vault.kdbx"]) {
      assert.equal(matchesAny(path, DEFAULT_EXCLUDE_GLOBS), true, path);
      assert.equal(matchesAny(`C:\\project\\${path.replaceAll("/", "\\")}`, DEFAULT_EXCLUDE_GLOBS), true, path);
    }
    assert.equal(matchesAny("src/env.ts", DEFAULT_EXCLUDE_GLOBS), false);
  });
});
