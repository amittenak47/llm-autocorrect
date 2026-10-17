import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLogicPrompt, parseLogicIssues } from "../../out/logicReview.js";

const issue = (line = 1, confidence = "medium", replacement = "  return total;") =>
  ({ line, message: "Return the accumulated total.", replacement, confidence });
const reply = (issues) => JSON.stringify({ issues });

test("logic prompt numbers block-relative lines with aligned columns and preserves indentation", () => {
  const prompt = buildLogicPrompt("function sum() {\n  return 0;\n}", "JavaScript", 5);
  assert.equal(prompt.user, "  1| function sum() {\n  2|   return 0;\n  3| }");
  assert.match(prompt.system, /You review JavaScript code for likely LOGIC bugs only/);
  assert.match(prompt.system, /at most 5/);
  assert.match(prompt.system, /Omit "replacement" when the fix is not a single-line change/);
  assert.equal(buildLogicPrompt("a\r\nb", "Python", 2).user, "  1| a\n  2| b");
  const many = buildLogicPrompt(Array(1000).fill("x").join("\n"), "Python", 1).user.split("\n");
  assert.equal(many[0], "   1| x");
  assert.equal(many[999], "1000| x");
});

test("valid JSON preserves replacement indentation and defaults missing confidence to medium", () => {
  assert.deepEqual(parseLogicIssues(reply([issue()]), 3, 5), [issue()]);
  const missing = { line: 2, message: "  Return a value.  " };
  assert.deepEqual(parseLogicIssues(reply([missing]), 3, 5), [{ line: 2, message: "Return a value.", confidence: "medium" }]);
});

test("fenced JSON and prose around JSON are accepted", () => {
  const json = reply([issue(2, "high")]);
  assert.deepEqual(parseLogicIssues("```json\n" + json + "\n```", 3, 5), [issue(2, "high")]);
  assert.deepEqual(parseLogicIssues("Likely bugs:\n" + json + "\nEnd of review.", 3, 5), [issue(2, "high")]);
});

test("invalid JSON and invalid response shapes yield no issues", () => {
  for (const text of ["invalid", '{"issues":[', "null", "[]", "{}", '{"issues":{}}', '{"issues":null}']) {
    assert.deepEqual(parseLogicIssues(text, 3, 5), []);
  }
});

test("invalid lines, messages and confidence values are dropped", () => {
  const entries = [issue(0), issue(-1), issue(4), issue(1.5), issue("1"), null, "bad",
    { ...issue(), message: "  " }, { ...issue(), message: 7 }, issue(1, "low"), issue(1, null), issue(3)];
  assert.deepEqual(parseLogicIssues(reply(entries), 3, 5), [issue(3)]);
});

test("invalid replacements are omitted without dropping the issue", () => {
  for (const replacement of ["", "  ", "a\nb", "a\r\nb", "a\rb", 7, null]) {
    assert.deepEqual(parseLogicIssues(reply([issue(1, "high", replacement)]), 3, 5), [
      { line: 1, message: issue().message, confidence: "high" },
    ]);
  }
});

test("high confidence issues come first before the cap, retaining order within confidence", () => {
  const entries = [issue(1), issue(2, "high"), issue(3), issue(4, "high")];
  assert.deepEqual(parseLogicIssues(reply(entries), 4, 3), [entries[1], entries[3], entries[0]]);
  assert.deepEqual(parseLogicIssues(reply(entries), 4, 0), []);
  assert.deepEqual(parseLogicIssues(reply(entries), 4, -1), []);
  assert.deepEqual(parseLogicIssues(reply(entries), 4, 1.8), [entries[1]]);
});
