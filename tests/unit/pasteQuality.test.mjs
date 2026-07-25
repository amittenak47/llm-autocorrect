import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { looksLikeFaithfulTranslation } from "../../out/pasteQuality.js";

describe("pasteQuality", () => {
  it("accepts a faithful C++ → Python print translation", () => {
    assert.equal(
      looksLikeFaithfulTranslation(
        'int main() { std::cout << "hi"; }',
        'print("hi")'
      ),
      true
    );
  });

  it("rejects inventing greet from a cout snippet", () => {
    assert.equal(
      looksLikeFaithfulTranslation(
        'int main() { std::cout << "hi"; }',
        'def greet(name):\n    print(f"hi {name}")'
      ),
      false
    );
  });

  it("rejects dropping string literals", () => {
    assert.equal(
      looksLikeFaithfulTranslation(
        'System.out.println("hello world");',
        "print(x)"
      ),
      false
    );
  });
});
