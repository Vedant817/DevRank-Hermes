import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeContextWriteInput,
  writeContext,
  type ContextProviders,
} from "../src/index.js";

test("normalizes context writes with a stable source id", () => {
  const input = {
    content: "Built context retry handling.",
    source: "unit-test",
    title: "Context retry",
  };

  assert.equal(
    normalizeContextWriteInput(input).sourceId,
    normalizeContextWriteInput(input).sourceId,
  );
  assert.equal(
    normalizeContextWriteInput({ ...input, sourceId: "explicit-id" }).sourceId,
    "explicit-id",
  );
});

test("combined context writes record Supermemory success in Supabase metadata", async () => {
  const writes: unknown[] = [];
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      writes.push(input);

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async () => ({
      id: "supermemory-1",
      source: "supermemory",
      summary: "Stored externally.",
      title: "External context",
    }),
  });

  await writeContext(
    {
      content: "Built context retry handling.",
      source: "unit-test",
      title: "Context retry",
    },
    {
      CONTEXT_PROVIDER: "combined",
      SUPERMEMORY_API_KEY: "test-key",
    },
    providers,
  );

  const supabaseInput = writes[0] as {
    metadata?: { externalContext?: { supermemory?: { id?: string; status?: string } } };
    sourceId?: string;
  };

  assert.equal(typeof supabaseInput.sourceId, "string");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.status, "written");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.id, "supermemory-1");
});

test("combined context writes record Supermemory failure status before rethrowing", async () => {
  const writes: unknown[] = [];
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      writes.push(input);

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async () => {
      throw new Error("token=secret-value failed");
    },
  });

  await assert.rejects(
    writeContext(
      {
        content: "Built context retry handling.",
        source: "unit-test",
        title: "Context retry",
      },
      {
        CONTEXT_PROVIDER: "combined",
        SUPERMEMORY_API_KEY: "test-key",
      },
      providers,
    ),
    /secret-value failed/,
  );

  const supabaseInput = writes[0] as {
    metadata?: { externalContext?: { supermemory?: { error?: string; status?: string } } };
    sourceId?: string;
  };

  assert.equal(typeof supabaseInput.sourceId, "string");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.status, "failed");
  assert.equal(supabaseInput.metadata?.externalContext?.supermemory?.error, "token=[REDACTED_SECRET] failed");
});

test("combined context retries reuse the same remote identity after a Supabase failure", async () => {
  const remoteWrites: Array<{ sourceId?: string }> = [];
  let supabaseAttempts = 0;
  const providers = fakeProviders({
    writeSupabase: async (input) => {
      supabaseAttempts += 1;

      if (supabaseAttempts === 1) {
        throw new Error("Supabase unavailable");
      }

      return {
        id: "supabase-1",
        metadata: input.metadata,
        source: input.source,
        summary: input.content,
        title: input.title,
      };
    },
    writeSupermemory: async (input) => {
      remoteWrites.push({ sourceId: input.sourceId });

      return {
        id: "supermemory-1",
        source: "supermemory",
        summary: input.content,
        title: input.title,
      };
    },
  });
  const input = {
    content: "Built idempotent context retries.",
    source: "unit-test",
    title: "Context retry",
  };
  const env = {
    CONTEXT_PROVIDER: "combined",
    SUPERMEMORY_API_KEY: "test-key",
  };

  await assert.rejects(writeContext(input, env, providers), /Supabase unavailable/);
  await writeContext(input, env, providers);

  assert.equal(remoteWrites.length, 2);
  assert.equal(typeof remoteWrites[0]?.sourceId, "string");
  assert.equal(remoteWrites[1]?.sourceId, remoteWrites[0]?.sourceId);
});

function fakeProviders(input: {
  writeSupabase: ContextProviders["writeSupabaseContext"];
  writeSupermemory: ContextProviders["writeSupermemoryContext"];
}): ContextProviders {
  return {
    searchSupabaseContext: async () => [],
    searchSupermemoryContext: async () => [],
    writeSupabaseContext: input.writeSupabase,
    writeSupermemoryContext: input.writeSupermemory,
  };
}
