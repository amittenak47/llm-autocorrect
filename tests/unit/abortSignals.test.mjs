import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anySignal, anySignalFallback } from "../../out/abortSignals.js";

describe("abort signal combination", () => {
  it("fallback propagates the first abort reason and ignores later aborts", () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = anySignalFallback([first.signal, second.signal]);
    let events = 0;
    signal.addEventListener("abort", () => events++);
    const reason = new Error("cancelled");
    second.abort(reason);
    first.abort("later");
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason, reason);
    assert.equal(events, 1);
  });

  it("fallback handles already-aborted inputs in input order", () => {
    const first = new AbortController();
    const second = new AbortController();
    first.abort("first");
    second.abort("second");
    assert.equal(anySignalFallback([first.signal, second.signal]).reason, "first");
    assert.equal(anySignalFallback([new AbortController().signal, second.signal]).reason, "second");
  });

  it("fallback accepts empty inputs and un-aborted inputs", () => {
    assert.equal(anySignalFallback([]).aborted, false);
    assert.equal(anySignalFallback([new AbortController().signal]).aborted, false);
  });

  it("public helper combines signals", () => {
    const controller = new AbortController();
    const signal = anySignal([controller.signal]);
    controller.abort("stop");
    assert.equal(signal.reason, "stop");
  });
});
