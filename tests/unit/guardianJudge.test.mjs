import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGuardianJudgeUserMessage,
  parseGuardianScore,
} from "../../out/guardianJudge.js";

describe("guardianJudge", () => {
  it("builds a no-think guardian block with original and candidate", () => {
    const msg = buildGuardianJudgeUserMessage({
      original: "pritnf(x)",
      candidate: "print(x)",
    });
    assert.match(msg, /ORIGINAL:\npritnf\(x\)/);
    assert.match(msg, /ASSISTANT_REPLY:\nprint\(x\)/);
    assert.match(msg, /<guardian>/);
    assert.match(msg, /<no-think>/);
    assert.match(msg, /### Criteria:/);
    assert.match(msg, /When unsure, score 'no'/);
    assert.match(msg, /Reject style-only/);
    assert.match(msg, /If uncertain, return 'no'/);
  });

  it("parses <score> tags", () => {
    assert.equal(parseGuardianScore("<think>\nok\n</think>\n<score>yes</score>"), "yes");
    assert.equal(parseGuardianScore("<score>no</score>"), "no");
  });

  it("parses bare yes/no", () => {
    assert.equal(parseGuardianScore("yes"), "yes");
    assert.equal(parseGuardianScore("no"), "no");
  });
});
