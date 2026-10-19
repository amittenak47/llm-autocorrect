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

describe("Semaphore resizing", () => {
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const held = (sem, started, id) => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const result = sem.use(async () => {
      started.push(id);
      await gate;
    });
    return { release, result };
  };

  it("waits for active work to drain after lowering the limit", async () => {
    const sem = new Semaphore(2);
    const started = [];
    const first = held(sem, started, 1);
    const second = held(sem, started, 2);
    const third = held(sem, started, 3);
    await tick();
    assert.deepEqual(started, [1, 2]);
    sem.setMax(1);
    first.release();
    await first.result;
    await tick();
    assert.deepEqual(started, [1, 2]);
    second.release();
    await second.result;
    await tick();
    assert.deepEqual(started, [1, 2, 3]);
    third.release();
    await third.result;
  });

  it("wakes queued work immediately when the limit rises", async () => {
    const sem = new Semaphore(1);
    const started = [];
    const tasks = [1, 2, 3, 4].map((id) => held(sem, started, id));
    await tick();
    assert.deepEqual(started, [1]);
    sem.setMax(3);
    await tick();
    assert.deepEqual(started, [1, 2, 3]);
    tasks[0].release();
    await tasks[0].result;
    await tick();
    assert.deepEqual(started, [1, 2, 3, 4]);
    tasks.forEach((task) => task.release());
    await Promise.all(tasks.map((task) => task.result));
  });

  it("clamps the limit to at least one and releases slots after failures", async () => {
    const sem = new Semaphore(0);
    sem.setMax(-2);
    await assert.rejects(sem.use(async () => { throw new Error("failed"); }), /failed/);
    assert.equal(await sem.use(async () => 42), 42);
  });
});
