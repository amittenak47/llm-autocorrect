import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDiagnosticsForLine, formatDiagnosticsForBlock, lineFixExamples } from "../../out/diagPrompt.js";
import { lineFixBody, blockFixBody } from "../../out/promptMerge.js";

const diag = (line, message = "Expected colon", severity = 0, character = 14) => ({ line, character, message, severity });

test("line diagnostics prioritize the target, nearest neighbors, and errors/warnings", () => {
  assert.equal(formatDiagnosticsForLine(5, [diag(3), diag(9), diag(6), diag(5), diag(5, "info", 2), diag(4)]),
    "Diagnostics (from the language server):\n- TARGET line, col 15: Expected colon\n- line above the target: Expected colon\n- line below the target: Expected colon\n- 2 lines above the target: Expected colon");
  assert.equal(formatDiagnosticsForLine(0, [diag(4), diag(0, "hint", 3)]), "");
});

test("diagnostics keep the first 160 message characters and at most six entries", () => {
  const text = formatDiagnosticsForLine(2, Array.from({ length: 8 }, () => diag(2, "x".repeat(200) + "\nignored")));
  assert.equal(text.split("\n").length, 7);
  assert.equal(text.split("\n")[1], "- TARGET line, col 15: " + "x".repeat(160));
  assert.equal(formatDiagnosticsForLine(2, [diag(2, 'Expected ":"\r\nextra')]).split("\n")[1], '- TARGET line, col 15: Expected ":"');
});

test("block diagnostics use relative one-based lines and columns with inclusive bounds", () => {
  assert.equal(formatDiagnosticsForBlock(3, 5, [diag(2), diag(5, "last", 1, 7), diag(3, "first", 0, 0), diag(6)]),
    "Diagnostics (from the language server):\n- block line 1, col 1: first\n- block line 3, col 8: last");
  assert.equal(formatDiagnosticsForBlock(3, 5, []), "");
  assert.equal(formatDiagnosticsForBlock(0, 10, Array.from({ length: 9 }, (_, i) => diag(i))).split("\n").length, 7);
});

test("exactly five language-specific examples include an unchanged reply", () => {
  const py = lineFixExamples("python");
  assert.equal(py.split("\n").length, 5);
  assert.ok(py.includes('TARGET: pritn("hi") => REPLY: print("hi")'));
  assert.ok(py.includes("TARGET: x = compute(a, b) => REPLY: UNCHANGED"));
  assert.equal(lineFixExamples("go"), lineFixExamples("typescript"));
  assert.equal(lineFixExamples("rust").split("\n").length, 5);
});

test("fix prompt details follow code, names precede diagnostics, and omitted options preserve the body", () => {
  const diagnostics = formatDiagnosticsForLine(0, [diag(0)]);
  const body = lineFixBody("above", "a\nb", diagnostics, ["a", "b"], true);
  assert.ok(body.includes("TARGET lines:\na\nb\n\nNames defined in this file: a, b\n\n" + diagnostics));
  assert.ok(lineFixBody("", "x").endsWith("TARGET line:\nx"));
  assert.equal(blockFixBody("x", "", []), "Code:\nx");
  assert.equal(blockFixBody("x", diagnostics, ["a"]), "Code:\nx\n\nNames defined in this file: a\n\n" + diagnostics);
});
