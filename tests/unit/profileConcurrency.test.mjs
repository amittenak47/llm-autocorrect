import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Semaphore } from "../../out/semaphore.js";
import { defaultMaxConcurrent } from "../../out/profiles.js";

describe("profileConcurrency", () => {
  it("limits concurrent work", async () => {
    const sem = new Semaphore(2);
    let inFlight = 0;
    let peak = 0;

    const work = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
    };

    await Promise.all([sem.use(work), sem.use(work), sem.use(work), sem.use(work)]);
    assert.equal(peak, 2);
  });
});

describe("defaultMaxConcurrent", () => {
  it("uses 1 for localhost openai-compatible", () => {
    assert.equal(
      defaultMaxConcurrent({
        id: "l",
        label: "l",
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:8080/v1",
      }),
      1
    );
  });

  it("uses 2 for cloud providers", () => {
    assert.equal(
      defaultMaxConcurrent({ id: "g", label: "g", provider: "groq" }),
      2
    );
  });
});
