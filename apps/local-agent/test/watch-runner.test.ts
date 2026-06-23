import assert from "node:assert/strict";
import test from "node:test";
import { createSingleFlightRunner } from "../src/index.js";

test("single-flight watcher runner queues one rerun while active", async () => {
  let releaseFirstRun: (() => void) | undefined;
  let calls = 0;
  const runner = createSingleFlightRunner(async () => {
    calls += 1;

    if (calls === 1) {
      await new Promise<void>((resolve) => {
        releaseFirstRun = resolve;
      });
    }
  }, (error) => {
    assert.fail(error instanceof Error ? error.message : String(error));
  });

  const first = runner();
  const second = runner();
  const third = runner();

  await Promise.resolve();
  assert.equal(calls, 1);
  releaseFirstRun?.();
  await Promise.all([first, second, third]);
  assert.equal(calls, 2);

  await runner();
  assert.equal(calls, 3);
});

test("single-flight watcher runner catches task failures", async () => {
  const errors: unknown[] = [];
  let calls = 0;
  const runner = createSingleFlightRunner(async () => {
    calls += 1;
    throw new Error("ingestion failed");
  }, (error) => {
    errors.push(error);
  });

  await runner();
  await runner();

  assert.equal(calls, 2);
  assert.equal(errors.length, 2);
  assert.match(errors[0] instanceof Error ? errors[0].message : "", /ingestion failed/);
});
