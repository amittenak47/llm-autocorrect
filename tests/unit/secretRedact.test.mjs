import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets, containsSecret } from "../../out/secretRedact.js";
import { shouldSkipSecretTarget } from "../../out/privacySettings.js";

const marker = "\u00abredacted\u00bb";
const tokens = [
  "sk-ant-" + "A_-".repeat(8),
  "sk-" + "A_-".repeat(8),
  "sk-proj-" + "A_-".repeat(8),
  "gsk_" + "A".repeat(20),
  ...[..."pousr"].map((kind) => `gh${kind}_${"a".repeat(36)}`),
  "github_pat_" + "a_".repeat(11),
  ...["AKIA", "ASIA"].map((prefix) => prefix + "0A".repeat(8)),
  ...[..."abposr"].map((kind) => `xox${kind}-${"a-".repeat(5)}`),
  "AIza" + "A_-".repeat(11) + "ab",
  ...["r", "s"].flatMap((kind) => ["live", "test"].map((mode) => `${kind}k_${mode}_${"A".repeat(16)}`)),
  `eyJ${"a_".repeat(5)}.${"b-".repeat(5)}.${"c_".repeat(5)}`,
  ...["", "RSA ", "EC ", "OPENSSH ", "ENCRYPTED "].map((kind) =>
    `-----BEGIN ${kind}PRIVATE KEY-----\nprivate material\n-----END ${kind}PRIVATE KEY-----`),
];

describe("secretRedact", () => {
  for (const [index, token] of tokens.entries()) {
    it(`redacts secret pattern ${index + 1}`, () => {
      assert.deepEqual(redactSecrets(`before ${token} after`), { text: `before ${marker} after`, count: 1 });
      assert.equal(containsSecret(token), true);
      assert.equal(containsSecret(token), true, "detection has no global-regexp state");
    });
  }

  it("keeps assignment name, operator, spacing and quotes", () => {
    const input = 'api_key = "abcdef123"';
    assert.deepEqual(redactSecrets(input), { text: `api_key = "${marker}"`, count: 1 });
    for (const name of ["password", "passwd", "pwd", "secret", "token", "apiKey", "API-KEY",
      "access_key", "access-key", "client_secret", "CLIENT-SECRET", "auth"]) {
      const input = `"${name}" : 'abcdef'`;
      assert.deepEqual(redactSecrets(input), { text: `"${name}" : '${marker}'`, count: 1 });
      assert.equal(containsSecret(input), true, name);
    }
    assert.equal(redactSecrets('password = "abc\\\"def"').text, `password = "${marker}"`);
  });

  it("redacts a whole assigned value, counting it once even if it contains a token", () => {
    assert.deepEqual(redactSecrets(`token = "prefix ${tokens[0]} suffix"`), { text: `token = "${marker}"`, count: 1 });
    assert.equal(redactSecrets(tokens.join("\n")).count, tokens.length);
  });

  it("leaves normal code, short values and unrelated names untouched", () => {
    const text = 'const count = 42;\nprint("hello world");\npassword = "short";\noauth = "ordinary text"';
    assert.deepEqual(redactSecrets(text), { text, count: 0 });
    assert.equal(containsSecret(text), false);
    assert.deepEqual(redactSecrets(""), { text: "", count: 0 });
  });

  it("skips secret targets only when enabled for a nonlocal profile", () => {
    const secret = tokens[0];
    for (const profile of [
      { provider: "groq", baseUrl: "http://localhost:8080/v1" },
      { provider: "openai-compatible", baseUrl: "https://example.test/v1" },
      { provider: "openai-compatible" },
    ]) {
      assert.equal(shouldSkipSecretTarget(secret, profile, true), true);
      assert.equal(shouldSkipSecretTarget(secret, profile, false), false);
      assert.equal(shouldSkipSecretTarget("normal code", profile, true), false);
    }
    assert.equal(shouldSkipSecretTarget(secret, { provider: "openai-compatible", baseUrl: "http://127.0.0.1:8080/v1" }, true), false);
  });
});
