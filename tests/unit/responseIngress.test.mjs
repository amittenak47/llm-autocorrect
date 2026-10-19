import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  docsPreservesCode,
  mergeCavemanComments,
  fixForSingleLineTarget,
  isUnchanged,
  modelLines,
  normalizeModelText,
  preserveLeadingIndent,
} from "../../out/responseIngress.js";

describe("responseIngress", () => {
  it("normalizeModelText strips fences and CRLF", () => {
    assert.equal(normalizeModelText("```py\nfoo()\n```\r\n"), "foo()");
  });

  it("isUnchanged detects UNCHANGED", () => {
    assert.equal(isUnchanged("UNCHANGED"), true);
    assert.equal(isUnchanged("  UNCHANGED  "), true);
    assert.equal(isUnchanged("foo"), false);
  });

  it("modelLines drops UNCHANGED", () => {
    assert.deepEqual(modelLines("UNCHANGED"), []);
    assert.deepEqual(modelLines("a\nb"), ["a", "b"]);
  });

  it("fixForSingleLineTarget keeps extra lines for syntax fixes", () => {
    assert.equal(fixForSingleLineTarget(["def f("]), "def f(");
    assert.equal(fixForSingleLineTarget(["", "def f(", ")"]), "def f(\n)");
    assert.equal(fixForSingleLineTarget(["  ", ""]), undefined);
  });

  it("preserveLeadingIndent keeps Enter auto-indent from the buffer", () => {
    assert.equal(preserveLeadingIndent("    return a + b", "return a + b"), "    return a + b");
    assert.equal(preserveLeadingIndent("\tpritnf(x)", "print(x)"), "\tprint(x)");
    assert.equal(preserveLeadingIndent("  foo", "  bar"), "  bar");
  });
});

const python = { id: "python", name: "Python", lineCommentPrefixes: ["#"] };
const typescript = { id: "typescript", name: "TypeScript", lineCommentPrefixes: ["//"] };

describe("docsPreservesCode", () => {
  it("rejects code dedented after an inserted docstring", () => {
    assert.equal(docsPreservesCode("if ready:\n    launch()", "if ready:\n    \"\"\"Documentation.\"\"\"\nlaunch()", python), false);
  });

  it("accepts an indented function docstring", () => {
    const original = "def f():\n    launch()";
    assert.equal(docsPreservesCode(original, "def f():\n    \"\"\"Documentation.\"\"\"\n    launch()", python), true);
    assert.equal(docsPreservesCode(original, "def f():\n    \"\"\"Documentation.\n    More detail.\n    \"\"\"\n    launch()", python), true);
    const quote = "'".repeat(3);
    assert.equal(docsPreservesCode(original, `def f():\n    ${quote}Documentation.${quote}\n    launch()`, python), true);
  });

  it("accepts JSDoc above a function and ordinary block comments", () => {
    const original = "function f() {\n  launch();\n}";
    assert.equal(docsPreservesCode(original, "/**\n * Documentation.\n */\n" + original, typescript), true);
    assert.equal(docsPreservesCode(original, "/* Documentation. */\n" + original, typescript), true);
  });


  it("allows extra documentation inside an existing block", () => {
    const original = "/**\n * Existing.\n */\nfunction f() {}";
    const result = "/**\n * Existing.\n * More documentation.\n */\nfunction f() {}";
    assert.equal(docsPreservesCode(original, result, typescript), true);
    assert.equal(docsPreservesCode("def f():\n    \"\"\"\n    Existing.\n    \"\"\"\n    launch()", "def f():\n    \"\"\"\n    Existing.\n    More documentation.\n    \"\"\"\n    launch()", python), true);
  });

  it("rejects extra code, reordered or missing lines, and substring matches", () => {
    assert.equal(docsPreservesCode("a()\nb()", "b()\na()", python), false);
    assert.equal(docsPreservesCode("a()\nb()", "a()", python), false);
    assert.equal(docsPreservesCode("a()", "a()\nevil()", python), false);
    assert.equal(docsPreservesCode("a()", "prefix_a()", python), false);
    assert.equal(docsPreservesCode("a()\na()", "a()", python), false);
  });

  it("ignores trailing whitespace and allows blank and line-comment additions", () => {
    assert.equal(docsPreservesCode("# old\na()  \n", "\n# docs\na()\n", python), true);
    assert.equal(docsPreservesCode("  a()", "a()", python), false);
  });

  it("rejects extra code following documentation delimiters and unclosed blocks", () => {
    assert.equal(docsPreservesCode("a()", "\"\"\"Docs\"\"\"; evil()\na()", python), false);
    assert.equal(docsPreservesCode("a();", "/* Docs */ evil();\na();", typescript), false);
    assert.equal(docsPreservesCode("a()", "a()\n\"\"\"unfinished", python), false);
  });
});

describe("mergeCavemanComments with CRLF", () => {
  it("merges comments without carrying CR into output or comment suffixes", () => {
    assert.equal(
      mergeCavemanComments("x = 1\r\n    launch(x)\r\ndone()", "x = 1 # store value\n    launch(x)\ndone()", python),
      "x = 1 # store value\n    launch(x)\ndone()"
    );
  });

  it("still rejects code changes in CRLF blocks", () => {
    assert.equal(mergeCavemanComments("x = 1\r\ny = 2", "x = 3 # changed\ny = 2", python), undefined);
  });
});


describe("inserted documentation blocks cannot swallow code", () => {
  it("rejects Python code inside an inserted docstring", () => {
    assert.equal(docsPreservesCode('def f():\n    return 42',
      'def f():\n    """Doc.\n    return 42\n    """', python), false);
  });

  it("rejects C-family code inside an inserted block comment", () => {
    assert.equal(docsPreservesCode("return 42;", "/* Doc.\nreturn 42;\n*/", typescript), false);
  });

  it("keeps an original multiline docstring and permits an inserted comment", () => {
    const original = 'def f():\n    """Doc.\n    More.\n    """\n    return 42';
    assert.equal(docsPreservesCode(original, original.replace("    return 42", "    # Result.\n    return 42"), python), true);
  });

  it("accepts an inserted docstring closed before the original code", () => {
    assert.equal(docsPreservesCode('def f():\n    return 42',
      'def f():\n    """Doc.\n    """\n    return 42', python), true);
  });
});

describe("stripReplyLabels", () => {
  it("removes labels a model copied from the prompt", async () => {
    const { stripReplyLabels, modelLines, fixForSingleLineTarget } = await import("../../out/responseIngress.js");
    // The exact reply seen from Granite 4.1 8B in manual testing.
    assert.equal(stripReplyLabels("REPLY: \n    return len(items)"), "    return len(items)");
    assert.equal(stripReplyLabels("    totl = 0\n\nCorrection:\n    total = 0"), "    total = 0");
    assert.equal(stripReplyLabels("REPLY: print(x)"), "print(x)");
    assert.equal(stripReplyLabels('TARGET: pritn("hi") => REPLY: print("hi")'), 'print("hi")');
    assert.equal(stripReplyLabels("->  print(x)"), "print(x)");
    assert.equal(stripReplyLabels("REPLY: UNCHANGED"), "UNCHANGED");
    assert.deepEqual(modelLines("REPLY: UNCHANGED"), []);
    assert.equal(fixForSingleLineTarget(modelLines("REPLY: \n    return len(items)")), "    return len(items)");
  });

  it("leaves real code alone", async () => {
    const { stripReplyLabels } = await import("../../out/responseIngress.js");
    for (const code of ["answer: int = 5", "result: list[int] = []", "    output = run()", "def reply(x):", "x = a -> b", "Output = 3"]) {
      assert.equal(stripReplyLabels(code), code, code);
    }
  });
});

describe("stripReplyLabels for block replies", () => {
  it("drops a CODE: label line seen from Granite on a block fix", async () => {
    const { stripReplyLabels } = await import("../../out/responseIngress.js");
    assert.equal(stripReplyLabels("CODE:\ndef f():\n    return 1"), "def f():\n    return 1");
    assert.equal(stripReplyLabels("CODE BLOCK:\nx = 1"), "x = 1");
    assert.equal(stripReplyLabels("CODE = 3"), "CODE = 3");
  });
});
