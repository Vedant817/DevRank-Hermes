import assert from "node:assert/strict";
import test from "node:test";
import {
  supermemoryCustomId,
  writeSupermemoryContext,
} from "../src/supermemory.js";

test("writes Supermemory documents with a stable custom id and supported metadata", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const input = {
    containerTags: ["project-devrank"],
    content: "Context write completed.",
    metadata: {
      nested: { ignored: true },
      priority: 2,
      verified: true,
    },
    source: "unit-test",
    sourceId: "context-1",
    title: "Context write",
  };
  const fetchImpl: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ id: "supermemory-1", status: "queued" });
  };

  await writeSupermemoryContext(input, {
    SUPERMEMORY_API_KEY: "test-key",
  }, {
    fetch: fetchImpl,
  });
  await writeSupermemoryContext(input, {
    SUPERMEMORY_API_KEY: "test-key",
  }, {
    fetch: fetchImpl,
  });

  assert.equal(bodies[0]?.customId, supermemoryCustomId(input));
  assert.equal(bodies[1]?.customId, bodies[0]?.customId);
  assert.equal(bodies[0]?.containerTag, "project-devrank");
  assert.deepEqual(bodies[0]?.metadata, {
    priority: 2,
    source: "unit-test",
    sourceId: "context-1",
    title: "Context write",
    verified: true,
  });
  assert.equal(bodies[0]?.title, undefined);
});
